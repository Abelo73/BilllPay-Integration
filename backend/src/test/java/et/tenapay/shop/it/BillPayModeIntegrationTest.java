package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Sandbox / live switch from the admin: no restart, new orders use the chosen BillPay and its key, orders keep the
 * environment they were placed in, and an event signed with the sandbox secret can never settle a live payment.
 */
class BillPayModeIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0911223344";

	@org.springframework.beans.factory.annotation.Autowired
	et.tenapay.shop.webhook.WebhookEventRepository webhooks;

	@AfterEach
	void backToSandbox() {
		post("/api/admin/billpay/mode", Map.of("mode", "SANDBOX"), adminToken());
	}

	private Res switchTo(String mode, String confirm, String token) {
		return post("/api/admin/billpay/mode", confirm == null ? Map.of("mode", mode) : Map.of("mode", mode, "confirm", confirm),
				token);
	}

	private Res sendSigned(String body, String secret) {
		return postRaw("/api/webhooks/billpay", body, Map.of("X-Billpay-Signature", signature(body, secret),
				"X-Billpay-Event", "PaymentCaptured"));
	}

	private String orderField(String orderNumber, String field, String admin) {
		return get("/api/admin/orders/" + orderNumber, admin).body().path("order").path(field).asString();
	}

	@Test
	void onlyAdminsCanSwitch_andLiveNeedsTypedConfirmation() {
		String admin = adminToken();
		assertThat(switchTo("LIVE", "LIVE", shopperToken()).status()).as("customer").isEqualTo(403);
		Res unconfirmed = switchTo("LIVE", null, admin);
		assertThat(unconfirmed.status()).isEqualTo(400);
		assertThat(unconfirmed.text("code")).isEqualTo("CONFIRMATION_REQUIRED");
		assertThat(get("/api/store-info").body().path("sandbox").asBoolean()).isTrue();

		Res live = switchTo("LIVE", "LIVE", admin);
		assertThat(live.status()).as(live.raw()).isEqualTo(200);
		assertThat(live.text("mode")).isEqualTo("LIVE");
		assertThat(live.text("changedBy")).isEqualTo(ADMIN_EMAIL);
		assertThat(get("/api/store-info").body().path("sandbox").asBoolean()).as("store banner off").isFalse();
		assertThat(get("/api/admin/config", admin).body().path("mode").path("mode").asString()).isEqualTo("LIVE");
	}

	@Test
	void liveOrdersUseTheLiveKey_andIgnoreSandboxSignedEvents() {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("3200.00"), 5);

		// an order placed in the sandbox stays a sandbox order after the switch
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		String sandboxOrder = post("/api/checkout", checkoutBody(productId, 1, PHONE)).text("orderNumber");
		assertThat(orderField(sandboxOrder, "environment", admin)).isEqualTo("SANDBOX");

		assertThat(switchTo("LIVE", "LIVE", admin).status()).isEqualTo(200);
		billPay.resetAll();
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res res = post("/api/checkout", checkoutBody(productId, 1, PHONE));
		assertThat(res.status()).as(res.raw()).isEqualTo(200);
		String liveOrder = res.text("orderNumber");
		assertThat(orderField(liveOrder, "environment", admin)).isEqualTo("LIVE");
		billPay.verify(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH)).withHeader("x-api-key", equalTo(LIVE_API_KEY)));

		String webhook = BillPayFake.capturedWebhook(paymentId, liveOrder + "-A1", new BigDecimal("3200.0000"));
		// genuine BillPay format, but signed with the sandbox secret: must not mark a real-money order paid
		assertThat(sendSigned(webhook, WEBHOOK_SECRET).status()).isEqualTo(200);
		await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofMillis(300)).untilAsserted(() -> assertThat(
				webhooks.findForPayment(paymentId, liveOrder + "-A1")).extracting(e -> e.getStatus().name())
				.containsExactly("IGNORED"));
		assertThat(orderField(liveOrder, "status", admin)).isEqualTo("PENDING_PAYMENT");

		// signed with the live secret: applied
		assertThat(sendSigned(webhook, LIVE_WEBHOOK_SECRET).status()).isEqualTo(200);
		await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofMillis(300))
				.untilAsserted(() -> assertThat(orderField(liveOrder, "status", admin)).isEqualTo("PAID"));

		// reports and the dashboard count live and sandbox orders separately
		assertThat(get("/api/admin/reports?days=1", admin).body().path("environment").asString()).isEqualTo("LIVE");
		assertThat(get("/api/admin/reports?days=1&env=SANDBOX", admin).body().path("environment").asString())
				.isEqualTo("SANDBOX");
	}
}
