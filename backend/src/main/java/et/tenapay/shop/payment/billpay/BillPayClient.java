package et.tenapay.shop.payment.billpay;

import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import et.tenapay.shop.monitoring.ShopMetrics;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The only class that talks HTTP to BillPay. */
@Slf4j
@Component
public class BillPayClient {

	private static final int MAX_NETWORK_RETRIES = 2;

	private final RestClient http;
	private final BillPayProperties props;
	private final ObjectMapper json;
	private final ShopMetrics metrics;

	public record Customer(String name, String phone, String email) {
	}

	public record CreatePaymentRequest(String merchantReference, BigDecimal amount, String currency,
			String description, Customer customer, String returnUrl, String cancelUrl) {
	}

	public BillPayClient(BillPayProperties props, ObjectMapper json, ShopMetrics metrics) {
		this.props = props;
		this.json = json;
		this.metrics = metrics;
		HttpClient httpClient = HttpClient.newBuilder().connectTimeout(props.timeout()).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
		factory.setReadTimeout(props.timeout());
		this.http = RestClient.builder()
				.baseUrl(props.baseUrl())
				.requestFactory(factory)
				.defaultHeader("x-api-key", props.apiKey())
				.defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
				.build();
		if (props.apiKey() == null || props.apiKey().isBlank()) {
			log.warn("BILLPAY_API_KEY is not set; calls to BillPay will be rejected");
		}
	}

	public String toJson(Object value) {
		return json.writeValueAsString(value);
	}

	/**
	 * Creates a hosted-checkout payment. Network failures are retried with the same Idempotency-Key, so
	 * BillPay can recognise a repeat and not create a second payment.
	 */
	public BillPayPayment createPayment(String requestJson, UUID idempotencyKey) {
		String body = postWithRetry("create_payment", props.createPaymentPath(), requestJson, idempotencyKey);
		return BillPayPayloads.parsePayment(readEnvelope(body), body);
	}

	public BillPayPayment getPayment(String billpayPaymentId) {
		String body = send("get_payment", () -> http.get().uri(props.paymentStatusPath(), billpayPaymentId));
		return BillPayPayloads.parsePayment(readEnvelope(body), body);
	}

	/**
	 * Refunds part of a captured payment: POST /api/v1/checkout/payments/{id}/refunds (path confirmed 2026-10-23; the
	 * body shape is still unconfirmed, open question Q6).
	 */
	public BillPayRefund createRefund(String billpayPaymentId, String requestJson, UUID idempotencyKey) {
		String body = postWithRetry("create_refund", props.refundPath(), requestJson, idempotencyKey, billpayPaymentId);
		return BillPayPayloads.parseRefund(readEnvelope(body), body);
	}

	private String postWithRetry(String operation, String path, String requestJson, UUID idempotencyKey,
			Object... uriVariables) {
		BillPayException last = null;
		for (int attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
			try {
				return send(operation, () -> http.post()
						.uri(path, uriVariables)
						.contentType(MediaType.APPLICATION_JSON)
						.header("Idempotency-Key", idempotencyKey.toString())
						.body(requestJson));
			} catch (BillPayException e) {
				if (!e.isNetworkError()) {
					throw e;
				}
				last = e;
				log.warn("BillPay POST {} network error (try {}/{}): {}", path, attempt + 1, MAX_NETWORK_RETRIES + 1,
						e.getMessage());
			}
		}
		throw last;
	}

	private String send(String operation, java.util.function.Supplier<RestClient.RequestHeadersSpec<?>> request) {
		long started = System.nanoTime();
		String outcome = "network";
		try {
			String[] status = new String[1];
			String result = request.get().exchange((req, res) -> {
				String body = new String(res.getBody().readAllBytes(), StandardCharsets.UTF_8);
				int code = res.getStatusCode().value();
				status[0] = (code / 100) + "xx";
				log.debug("BillPay {} {} -> {} {}", req.getMethod(), req.getURI(), code, body);
				if (res.getStatusCode().isError()) {
					throw new BillPayException(code, body, "BillPay returned HTTP " + code + ": " + body, null);
				}
				return body;
			});
			outcome = status[0];
			return result;
		} catch (BillPayException e) {
			outcome = e.isNetworkError() ? "network" : (e.getHttpStatus() / 100) + "xx";
			throw e;
		} catch (ResourceAccessException | UncheckedIOException e) {
			throw new BillPayException(0, null, "BillPay unreachable: " + e.getMessage(), e);
		} finally {
			metrics.billPayCall(operation, Duration.ofNanos(System.nanoTime() - started), outcome);
		}
	}

	/** Parses the {statusCode, message, body} envelope and fails on a non-2xx statusCode. */
	private JsonNode readEnvelope(String body) {
		try {
			JsonNode root = json.readTree(body);
			int envelopeStatus = root.path("statusCode").asInt(200);
			if (envelopeStatus >= 300) {
				throw new BillPayException(envelopeStatus, body,
						"BillPay error " + envelopeStatus + ": " + root.path("message").asString(""), null);
			}
			return root;
		} catch (JacksonException e) {
			throw new BillPayException(502, body, "BillPay returned non-JSON response", e);
		}
	}
}
