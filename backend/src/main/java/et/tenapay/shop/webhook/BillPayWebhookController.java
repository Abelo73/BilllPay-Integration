package et.tenapay.shop.webhook;

import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.payment.billpay.BillPayPayloads;
import et.tenapay.shop.payment.billpay.BillPayPayment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** BillPay callback endpoint: verify, store, acknowledge. Processing happens later via Kafka. */
@Slf4j
@RestController
@RequiredArgsConstructor
public class BillPayWebhookController {

	private final WebhookSignatureVerifier verifier;
	private final WebhookEventRepository events;
	private final WebhookPublisher publisher;
	private final ObjectMapper json;
	private final et.tenapay.shop.monitoring.ShopMetrics metrics;

	@PostMapping("/api/webhooks/billpay")
	public ResponseEntity<Map<String, Object>> receive(@RequestBody String body,
			@RequestHeader Map<String, String> headers) {
		WebhookSignatureVerifier.Outcome verification = verifier.verify(body, headers);
		WebhookSignatureVerifier.Result signature = verification.result();

		WebhookEvent event = new WebhookEvent();
		event.setPayload(body);
		event.setHeaders(json.writeValueAsString(redact(headers)));
		event.setSignatureValid(signature == WebhookSignatureVerifier.Result.NOT_CHECKED ? null
				: signature == WebhookSignatureVerifier.Result.VALID);
		event.setSignatureScheme(verification.scheme());

		JsonNode root = null;
		try {
			root = json.readTree(body);
		} catch (JacksonException e) {
			event.setError("Body is not JSON");
		}
		if (root != null) {
			BillPayPayment payment = BillPayPayloads.parsePayment(root, body);
			JsonNode data = BillPayPayloads.paymentNode(root);
			// When the payment sits in a nested object, the top-level id is the event id.
			String eventId = data != root ? BillPayPayloads.text(root, "eventId", "id")
					: BillPayPayloads.text(root, "eventId", "webhookId");
			String eventType = BillPayPayloads.text(root, "event", "eventType", "type");
			event.setEventType(eventType);
			// BillPay reuses the payment id as eventId (seen 2026-10-23), so captured and refunded events of one
			// payment share it; the type makes the dedupe key unique per event.
			event.setBillpayEventId(eventId == null ? null : eventType == null ? eventId : eventId + ":" + eventType);
			event.setBillpayPaymentId(payment.paymentId());
			event.setMerchantReference(payment.merchantReference());
			event.setReportedStatus(payment.status());
		}

		if (signature == WebhookSignatureVerifier.Result.INVALID || root == null) {
			event.setStatus(WebhookEvent.Status.REJECTED);
			// A rejected delivery must not claim the event id: otherwise a forged copy sent first would make the
			// genuine BillPay delivery look like a duplicate (and a second forged copy would hit the unique index).
			if (event.getBillpayEventId() != null) {
				event.setError("Rejected (" + (root == null ? "invalid JSON" : verification.scheme()) + "), event id "
						+ event.getBillpayEventId());
				event.setBillpayEventId(null);
			}
			events.save(event);
			metrics.webhookReceived(root == null ? "invalid_json" : "rejected_signature");
			log.warn("Rejected BillPay webhook {}: {}", event.getId(), root == null ? "invalid JSON" : "bad signature");
			return ResponseEntity.status(root == null ? 400 : 401).body(Map.of("received", false));
		}

		if (event.getBillpayEventId() != null && events.existsByBillpayEventId(event.getBillpayEventId())) {
			log.info("Duplicate BillPay webhook event {} acknowledged", event.getBillpayEventId());
			metrics.webhookReceived("duplicate");
			return ResponseEntity.ok(Map.of("received", true, "duplicate", true));
		}

		event.setStatus(WebhookEvent.Status.RECEIVED);
		try {
			events.save(event);
		} catch (DataIntegrityViolationException e) {
			// Two copies of the same event raced past the exists() check.
			metrics.webhookReceived("duplicate");
			return ResponseEntity.ok(Map.of("received", true, "duplicate", true));
		}
		metrics.webhookReceived("accepted");
		log.info("Stored BillPay webhook {} (payment {}, status {})", event.getId(), event.getBillpayPaymentId(),
				event.getReportedStatus());
		// Publishing can block while Kafka is down; don't make BillPay wait for it.
		CompletableFuture.runAsync(() -> publisher.publish(event));
		return ResponseEntity.ok(Map.of("received", true));
	}

	private static Map<String, String> redact(Map<String, String> headers) {
		Map<String, String> copy = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
		copy.putAll(headers);
		copy.computeIfPresent("authorization", (k, v) -> "***");
		copy.computeIfPresent("x-api-key", (k, v) -> "***");
		return copy;
	}
}
