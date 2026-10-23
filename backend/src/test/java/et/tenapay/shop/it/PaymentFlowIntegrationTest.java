package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.matching;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlMatching;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.github.tomakehurst.wiremock.verification.LoggedRequest;

import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentService;
import et.tenapay.shop.payment.PaymentStatus;
import et.tenapay.shop.webhook.WebhookEvent;
import et.tenapay.shop.webhook.WebhookEventRepository;

/** Checkout → BillPay → webhook / status check → order, against a fake BillPay that replays sandbox payloads. */
class PaymentFlowIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0911223344";
	private static final BigDecimal PRICE = new BigDecimal("1450.00");

	@Autowired
	PaymentAttemptRepository attempts;
	@Autowired
	OrderRepository orders;
	@Autowired
	WebhookEventRepository webhooks;
	@Autowired
	PaymentService payments;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, PRICE, 10);
	}

	/** 1 × 1450 + 150 delivery (free only from 3000) */
	private static final BigDecimal TOTAL_ONE = new BigDecimal("1600.00");

	private Res checkout(int quantity) {
		return post("/api/checkout", checkoutBody(productId, quantity, PHONE));
	}

	private Res orderStatus(String orderNumber) {
		return get("/api/orders/" + orderNumber + "/status?phone=" + PHONE);
	}

	private PaymentAttempt latestAttempt(String orderNumber) {
		UUID orderId = orders.findByOrderNumber(orderNumber).orElseThrow().getId();
		return attempts.findFirstByOrderIdOrderByAttemptNoDesc(orderId).orElseThrow();
	}

	private void awaitOrderStatus(String orderNumber, String status) {
		await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(300))
				.untilAsserted(() -> assertThat(orderStatus(orderNumber).text("status")).isEqualTo(status));
	}

	@Test
	void paidThroughCapturedWebhook_andDuplicateIsIgnored() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);

		Res res = checkout(2);
		assertThat(res.status()).as(res.raw()).isEqualTo(200);
		String orderNumber = res.text("orderNumber");
		assertThat(res.text("checkoutUrl")).startsWith("https://sandbox.checkout.billpay.et/checkout/");

		// What we sent BillPay: API key, idempotency key, server-side total, https return link
		List<LoggedRequest> sent = billPay.findAll(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH)));
		assertThat(sent).hasSize(1);
		billPay.verify(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH))
				.withHeader("x-api-key", equalTo("test-api-key"))
				.withHeader("Idempotency-Key", matching("[0-9a-f-]{36}"))
				.withRequestBody(matchingJsonPath("$.merchantReference", equalTo(orderNumber + "-A1")))
				.withRequestBody(matchingJsonPath("$.currency", equalTo("ETB")))
				.withRequestBody(matchingJsonPath("$.returnUrl", matching("https://shop\\.test/api/billpay/return\\?order=.*"))));
		assertThat(json.readTree(sent.get(0).getBodyAsString()).path("amount").decimalValue())
				.isEqualByComparingTo("3050.00");

		assertThat(orderStatus(orderNumber).text("status")).isEqualTo("PENDING_PAYMENT");
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).isEqualTo(2);

		String webhook = BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("3050.0000"));
		Res ack = sendWebhook(webhook);
		assertThat(ack.status()).isEqualTo(200);
		assertThat(ack.body().path("received").asBoolean()).isTrue();

		awaitOrderStatus(orderNumber, "PAID");
		var product = adminProduct(productId, admin);
		assertThat(product.path("stock").asInt()).isEqualTo(8);
		assertThat(product.path("reserved").asInt()).isZero();
		assertThat(orderStatus(orderNumber).body().path("payment").path("paymentMethod").asString()).isEqualTo("TEST_WALLET");

		// BillPay retries deliveries: the second copy is acknowledged but not applied again
		Res again = sendWebhook(webhook);
		assertThat(again.status()).isEqualTo(200);
		assertThat(again.body().path("duplicate").asBoolean()).isTrue();
		assertThat(webhooks.findForPayment(paymentId, orderNumber + "-A1")).hasSize(1);
		assertThat(adminProduct(productId, admin).path("stock").asInt()).isEqualTo(8);
	}

	@Test
	void forgedOrUnsignedWebhooksAreRejected() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = checkout(1).text("orderNumber");
		String body = BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", TOTAL_ONE);

		Res forged = postRaw("/api/webhooks/billpay", body, Map.of("X-Billpay-Signature", signature(body, "whsec_wrong")));
		assertThat(forged.status()).isEqualTo(401);
		Res unsigned = postRaw("/api/webhooks/billpay", body, Map.of());
		assertThat(unsigned.status()).isEqualTo(401);
		// signed correctly, but the body was changed after signing
		String tampered = body.replace(TOTAL_ONE.toPlainString(), "1.00");
		Res changed = postRaw("/api/webhooks/billpay", tampered, Map.of("X-Billpay-Signature", signature(body, WEBHOOK_SECRET)));
		assertThat(changed.status()).isEqualTo(401);

		assertThat(webhooks.findForPayment(paymentId, orderNumber + "-A1"))
				.hasSize(3)
				.allSatisfy(e -> assertThat(e.getStatus()).isEqualTo(WebhookEvent.Status.REJECTED));
		assertThat(orderStatus(orderNumber).text("status")).isEqualTo("PENDING_PAYMENT");

		// The genuine delivery after the forged ones must still be applied, not taken for a duplicate
		Res genuine = sendWebhook(body);
		assertThat(genuine.status()).isEqualTo(200);
		assertThat(genuine.body().path("duplicate").asBoolean()).isFalse();
		awaitOrderStatus(orderNumber, "PAID");
	}

	@Test
	void failedTryKeepsOrderOpen_thenStatusCheckFindsPaymentWithoutWebhook() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = checkout(1).text("orderNumber");
		String reference = orderNumber + "-A1";
		UUID attemptId = latestAttempt(orderNumber).getId();

		// Shopper's wallet had no money (sandbox …0000): BillPay keeps the payment CREATED with a failed attempt
		BillPayFake.paymentStatus(billPay, paymentId, reference, TOTAL_ONE, "CREATED", "INSUFFICIENT_FUNDS");
		Res check = post("/api/admin/payments/" + attemptId + "/reconcile", Map.of(), admin);
		assertThat(check.status()).as(check.raw()).isEqualTo(200);
		Res status = orderStatus(orderNumber);
		assertThat(status.text("status")).isEqualTo("PENDING_PAYMENT");
		assertThat(status.body().path("payment").path("reasonCode").asString()).isEqualTo("INSUFFICIENT_FUNDS");
		assertThat(status.body().path("canRetry").asBoolean()).isTrue();

		// They retry and pay, but the webhook never arrives: the status check alone marks the order paid (TC-34)
		BillPayFake.paymentStatus(billPay, paymentId, reference, TOTAL_ONE, "CAPTURED", null);
		assertThat(post("/api/admin/payments/" + attemptId + "/reconcile", Map.of(), admin).text("status"))
				.isEqualTo("SUCCEEDED");
		assertThat(orderStatus(orderNumber).text("status")).isEqualTo("PAID");

		// A webhook arriving afterwards changes nothing
		sendWebhook(BillPayFake.capturedWebhook(paymentId, reference, TOTAL_ONE));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(webhooks.findForPayment(paymentId, reference))
				.singleElement().satisfies(e -> assertThat(e.getStatus()).isEqualTo(WebhookEvent.Status.DUPLICATE)));
		assertThat(orderStatus(orderNumber).text("status")).isEqualTo("PAID");
	}

	@Test
	void paymentWithWrongAmountNeedsReview() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = checkout(1).text("orderNumber");

		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("1.00")));

		awaitOrderStatus(orderNumber, "REVIEW_REQUIRED");
		assertThat(adminProduct(productId, admin).path("stock").asInt()).isEqualTo(10);
	}

	@Test
	void billPayDown_orderIsKept_andRetryReusesIdempotencyKey() {
		BillPayFake.createFails(billPay, 503);
		Res res = checkout(1);
		assertThat(res.status()).isEqualTo(502);
		assertThat(res.text("code")).isEqualTo("PAYMENT_PROVIDER_ERROR");
		String orderNumber = res.text("orderNumber");
		assertThat(orderNumber).isNotBlank();
		assertThat(latestAttempt(orderNumber).getStatus()).isEqualTo(PaymentStatus.ERROR);

		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res retry = post("/api/orders/" + orderNumber + "/pay", Map.of("phone", PHONE));
		assertThat(retry.status()).as(retry.raw()).isEqualTo(200);
		assertThat(retry.text("checkoutUrl")).contains("/checkout/");

		List<String> keys = billPay.findAll(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH))).stream()
				.map(r -> r.getHeader("Idempotency-Key")).distinct().toList();
		assertThat(keys).hasSize(1);
		assertThat(latestAttempt(orderNumber).getAttemptNo()).isEqualTo(1);
		assertThat(latestAttempt(orderNumber).getStatus()).isEqualTo(PaymentStatus.PENDING);
	}

	@Test
	void unpaidOrderExpires_andStockComesBack() {
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		String orderNumber = checkout(3).text("orderNumber");
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).isEqualTo(3);

		payments.expireOrder(orders.findByOrderNumber(orderNumber).orElseThrow().getId());

		assertThat(orderStatus(orderNumber).text("status")).isEqualTo("EXPIRED");
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).isZero();
		assertThat(adminProduct(productId, admin).path("stock").asInt()).isEqualTo(10);
		Res pay = post("/api/orders/" + orderNumber + "/pay", Map.of("phone", PHONE));
		assertThat(pay.status()).isEqualTo(409);
	}

	@Test
	void guestsNeedTheCheckoutPhoneToSeeAnOrder() {
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		String orderNumber = checkout(1).text("orderNumber");
		assertThat(get("/api/orders/" + orderNumber + "/status").status()).isEqualTo(404);
		assertThat(get("/api/orders/" + orderNumber + "/status?phone=0900000000").status()).isEqualTo(404);
		assertThat(get("/api/orders/" + orderNumber + "/status?phone=+251911223344").status()).isEqualTo(200);
	}

	@Test
	void cartWithTooManyItemsIsRefusedWithoutCallingBillPay() {
		Res res = checkout(11);
		assertThat(res.status()).isEqualTo(409);
		assertThat(res.text("code")).isEqualTo("CART_INVALID");
		billPay.verify(0, postRequestedFor(urlMatching(".*")));
	}

	@Test
	void refunds_overRefundStaysLocal_andBillPayRefundLimitIsRecorded() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = checkout(1).text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", TOTAL_ONE));
		awaitOrderStatus(orderNumber, "PAID");

		Res over = post("/api/admin/orders/" + orderNumber + "/refunds", Map.of("amount", "5000.00"), admin);
		assertThat(over.status()).isEqualTo(400);
		assertThat(over.text("code")).isEqualTo("REFUND_AMOUNT_INVALID");
		billPay.verify(0, postRequestedFor(urlMatching(".*/refunds")));

		BillPayFake.refundsBlocked(billPay, paymentId);
		Res refund = post("/api/admin/orders/" + orderNumber + "/refunds", Map.of("amount", "100.00", "reason", "test"), admin);
		assertThat(refund.status()).as(refund.raw()).isEqualTo(200);
		assertThat(refund.text("status")).isEqualTo("REFUSED");
		assertThat(refund.text("error")).contains("refund limit");
	}
}
