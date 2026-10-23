package et.tenapay.shop.webhook;

import java.time.Instant;
import java.util.Optional;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.KafkaConfig;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderService;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentService;
import et.tenapay.shop.payment.billpay.BillPayPayloads;
import et.tenapay.shop.payment.billpay.BillPayPayloads.EventKind;
import et.tenapay.shop.payment.billpay.BillPayPayment;
import et.tenapay.shop.payment.billpay.BillPayRefund;
import et.tenapay.shop.refund.RefundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Consumes stored webhooks from Kafka and applies them to payments, refunds and orders. Safe to run twice. */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebhookProcessor {

	private final WebhookEventRepository events;
	private final PaymentAttemptRepository attempts;
	private final OrderRepository orders;
	private final PaymentService payments;
	private final RefundService refunds;
	private final OrderService orderService;
	private final TransactionTemplate tx;
	private final ObjectMapper json;

	@KafkaListener(topics = KafkaConfig.WEBHOOK_EVENTS, groupId = "tenashop-webhooks")
	public void onMessage(String eventId) {
		process(Long.valueOf(eventId));
	}

	public void process(Long eventId) {
		WebhookEvent event = events.findById(eventId).orElse(null);
		if (event == null || event.getStatus() == WebhookEvent.Status.REJECTED) {
			return;
		}
		if (event.getStatus() != WebhookEvent.Status.RECEIVED && event.getStatus() != WebhookEvent.Status.PUBLISHED
				&& event.getStatus() != WebhookEvent.Status.FAILED) {
			log.debug("Webhook {} already {}", eventId, event.getStatus());
			return;
		}

		JsonNode root = json.readTree(event.getPayload());
		String source = "webhook#" + eventId;
		EventKind kind = BillPayPayloads.kind(event.getEventType(), event.getReportedStatus());
		switch (kind) {
			case TEST -> finish(eventId, WebhookEvent.Status.IGNORED, "Test delivery from BillPay");
			case REFUND -> {
				BillPayRefund refund = BillPayPayloads.parseRefund(root, event.getPayload());
				if (refund.status() == null && BillPayPayloads.statusFromEventType(event.getEventType()) != null) {
					refund = new BillPayRefund(refund.refundId(), refund.paymentId(), refund.merchantReference(),
							BillPayPayloads.statusFromEventType(event.getEventType()), refund.reasonCode(),
							refund.amount(), refund.raw());
				}
				finish(eventId, statusFor(refunds.applyWebhook(refund, source)), null);
			}
			case SETTLEMENT -> {
				BillPayPayment payment = BillPayPayloads.parsePayment(root, event.getPayload());
				Optional<PaymentAttempt> attempt = findAttempt(payment);
				attempt.ifPresent(a -> tx.executeWithoutResult(s -> orders.findById(a.getOrderId())
						.ifPresent(o -> orderService.note(o, "SETTLED", a.getMerchantReference() + " via " + source))));
				finish(eventId, attempt.isPresent() ? WebhookEvent.Status.PROCESSED : WebhookEvent.Status.IGNORED,
						attempt.isPresent() ? null : "Settlement for an unknown payment");
			}
			case PAYMENT -> {
				BillPayPayment payment = BillPayPayloads.parsePayment(root, event.getPayload());
				if (payment.status() == null) {
					payment = payment.withStatus(BillPayPayloads.statusFromEventType(event.getEventType()));
				}
				Optional<PaymentAttempt> attempt = findAttempt(payment);
				if (attempt.isEmpty()) {
					finish(eventId, WebhookEvent.Status.IGNORED, "No payment attempt matches paymentId="
							+ payment.paymentId() + " merchantReference=" + payment.merchantReference());
					return;
				}
				finish(eventId, statusFor(payments.applyBillPayStatus(attempt.get().getId(), payment, source)), null);
			}
		}
	}

	private Optional<PaymentAttempt> findAttempt(BillPayPayment payment) {
		return Optional.ofNullable(payment.paymentId())
				.flatMap(attempts::findByBillpayPaymentId)
				.or(() -> Optional.ofNullable(payment.merchantReference()).flatMap(attempts::findByMerchantReference));
	}

	private static WebhookEvent.Status statusFor(PaymentService.Outcome outcome) {
		return switch (outcome) {
			case APPLIED -> WebhookEvent.Status.PROCESSED;
			case DUPLICATE -> WebhookEvent.Status.DUPLICATE;
			case IGNORED -> WebhookEvent.Status.IGNORED;
		};
	}

	private void finish(Long eventId, WebhookEvent.Status status, String note) {
		tx.executeWithoutResult(s -> events.findById(eventId).ifPresent(e -> {
			e.setStatus(status);
			e.setError(note);
			e.setProcessedAt(Instant.now());
		}));
		log.info("Webhook {} -> {}{}", eventId, status, note != null ? " (" + note + ")" : "");
	}
}
