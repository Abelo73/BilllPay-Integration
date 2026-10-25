package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import com.github.tomakehurst.wiremock.WireMockServer;

/**
 * WireMock stubs shaped exactly like what sandbox.api.billpay.et returned on 2026-10-23 (see BillPayPayloadsTest for
 * the captured originals).
 */
public final class BillPayFake {

	public static final String CREATE_PATH = "/api/v1/checkout/payments";
	private static final String MERCHANT_ID = "cb24c910-d2c6-47e8-99de-84d0e84e3ac1";

	private BillPayFake() {
	}

	/** POST /api/v1/checkout/payments → 201 with the shopper's checkout link; echoes reference and amount. */
	public static void acceptsPayments(WireMockServer billPay, String paymentId) {
		Instant now = Instant.now();
		billPay.stubFor(post(urlEqualTo(CREATE_PATH)).willReturn(aResponse()
				.withStatus(201)
				.withHeader("Content-Type", "application/json")
				.withTransformers("response-template")
				.withBody("""
						{"statusCode":201,"message":"Payment created successfully","body":{
						 "id":"%s","merchantId":"%s",
						 "merchantReference":"{{jsonPath request.body '$.merchantReference'}}","status":"CREATED",
						 "amount":{"amount":{{jsonPath request.body '$.amount'}},"currency":"ETB"},
						 "charged":{"amount":{{jsonPath request.body '$.amount'}},"currency":"ETB"},
						 "fee":{"amount":0.0000,"currency":"ETB"},"refunded":{"amount":0.0000,"currency":"ETB"},
						 "description":"{{jsonPath request.body '$.description'}}",
						 "customer":{"name":"Test Buyer","phone":"****3344","email":"t***@it.test"},
						 "checkoutUrl":"https://sandbox.checkout.billpay.et/checkout/%s",
						 "returnUrl":"{{jsonPath request.body '$.returnUrl'}}",
						 "createdAt":"%s","expiresAt":"%s","completedAt":null,"attempts":[]},
						 "timestamp":"%s"}
						""".formatted(paymentId, MERCHANT_ID, "tok_" + paymentId.substring(0, 8), now,
						now.plus(30, ChronoUnit.MINUTES), now))));
	}

	/** Like {@link #acceptsPayments} but every payment gets its own id ("pay-<merchantReference>"), for many orders. */
	public static void acceptsEveryPayment(WireMockServer billPay) {
		billPay.stubFor(post(urlEqualTo(CREATE_PATH)).willReturn(aResponse()
				.withStatus(201)
				.withHeader("Content-Type", "application/json")
				.withTransformers("response-template")
				.withBody("""
						{"statusCode":201,"message":"Payment created successfully","body":{
						 "id":"pay-{{jsonPath request.body '$.merchantReference'}}",
						 "merchantReference":"{{jsonPath request.body '$.merchantReference'}}","status":"CREATED",
						 "amount":{"amount":{{jsonPath request.body '$.amount'}},"currency":"ETB"},
						 "checkoutUrl":"https://sandbox.checkout.billpay.et/checkout/pay-{{jsonPath request.body '$.merchantReference'}}",
						 "expiresAt":"%s","attempts":[]}}
						""".formatted(Instant.now().plus(30, ChronoUnit.MINUTES)))));
	}

	/** POST create → given HTTP status (e.g. 503 while BillPay is down). */
	public static void createFails(WireMockServer billPay, int status) {
		billPay.stubFor(post(urlEqualTo(CREATE_PATH)).willReturn(aResponse().withStatus(status)
				.withHeader("Content-Type", "application/json")
				.withBody("{\"statusCode\":" + status + ",\"message\":\"Service unavailable\"}")));
	}

	/**
	 * GET /api/v1/checkout/payments/{id}. A failed try keeps the payment CREATED with the reason on the attempt, which
	 * is what the sandbox does for the …0000 / …1111 test numbers.
	 */
	public static void paymentStatus(WireMockServer billPay, String paymentId, String reference, BigDecimal amount,
			String status, String failureCode) {
		String attempts = failureCode == null
				? (status.equals("CAPTURED") ? "[{\"attemptNo\":1,\"instrument\":\"TEST_WALLET\",\"status\":\"CAPTURED\"}]" : "[]")
				: "[{\"attemptNo\":1,\"instrument\":\"TEST_WALLET\",\"status\":\"FAILED\",\"failureCode\":\"" + failureCode + "\"}]";
		billPay.stubFor(get(urlEqualTo(CREATE_PATH + "/" + paymentId)).willReturn(aResponse().withStatus(200)
				.withHeader("Content-Type", "application/json")
				.withBody("""
						{"statusCode":200,"message":"Payment fetched successfully","body":{
						 "id":"%s","merchantReference":"%s","status":"%s",
						 "amount":{"amount":%s,"currency":"ETB"},"checkoutUrl":null,"attempts":%s}}
						""".formatted(paymentId, reference, status, amount.toPlainString(), attempts))));
	}

	/** POST /payments/{id}/refunds → 201, accepted and still processing (any payment, any amount). */
	public static void acceptsRefunds(WireMockServer billPay) {
		billPay.stubFor(post(com.github.tomakehurst.wiremock.client.WireMock.urlMatching(".*/payments/[^/]+/refunds")).willReturn(aResponse()
				.withStatus(201).withHeader("Content-Type", "application/json").withTransformers("response-template")
				.withBody("""
						{"statusCode":201,"message":"Refund created","body":{
						 "refundId":"rf-{{randomValue length=8 type='ALPHANUMERIC'}}","status":"PENDING",
						 "merchantReference":"{{jsonPath request.body '$.merchantReference'}}",
						 "amount":{"amount":{{jsonPath request.body '$.amount'}},"currency":"ETB"}}}
						""")));
	}

	/** POST /payments/{id}/refunds → 422, BillPay's answer while the merchant is at its refund limit. */
	public static void refundsBlocked(WireMockServer billPay, String paymentId) {
		billPay.stubFor(post(urlEqualTo(CREATE_PATH + "/" + paymentId + "/refunds")).willReturn(aResponse()
				.withStatus(422).withHeader("Content-Type", "application/json")
				.withBody("{\"statusCode\":422,\"message\":\"merchant is at its refund limit; settle or clear what is open first\"}")));
	}

	/** Body of the real PaymentCaptured webhook (eventId equals the payment id, as BillPay sends it). */
	public static String capturedWebhook(String paymentId, String reference, BigDecimal amount) {
		Instant now = Instant.now();
		return """
				{"eventId":"%s","eventType":"PaymentCaptured","occurredAt":"%s","data":{
				 "paymentId":"%s","merchantId":"%s","merchantReference":"%s",
				 "amount":%s,"chargedAmount":%s,"fee":0.0000,"vat":0.0000,"netAmount":%s,"currency":"ETB",
				 "provider":"SANDBOX_WALLET","instrument":"TEST_WALLET","capturedAt":"%s","attemptStartedAt":"%s"}}"""
				.formatted(paymentId, now, paymentId, MERCHANT_ID, reference, amount.toPlainString(),
						amount.toPlainString(), amount.toPlainString(), now, now.minusSeconds(170));
	}
}
