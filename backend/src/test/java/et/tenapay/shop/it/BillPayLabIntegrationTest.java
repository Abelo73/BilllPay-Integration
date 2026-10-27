package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Admin → BillPay lab: test payments straight against BillPay, every call kept, webhooks shown, live guarded. */
class BillPayLabIntegrationTest extends IntegrationTest {

	@Test
	void sandboxPaymentIsCreatedCheckedRefundedAndItsWebhookShows() {
		String admin = adminToken();
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);

		Res created = post("/api/admin/billpay-lab", Map.of("environment", "SANDBOX", "amount", 25, "description", "Lab check"), admin);
		assertThat(created.status()).as(created.raw()).isEqualTo(200);
		JsonNode run = created.body().path("run");
		String id = run.path("id").asString();
		String ref = run.path("merchantReference").asString();
		assertThat(ref).matches("^LAB-\\d{6}-\\d{6}-[A-Z0-9]{4}$");
		assertThat(run.path("billpayPaymentId").asString()).isEqualTo(paymentId);
		assertThat(run.path("checkoutUrl").asString()).isNotBlank();
		JsonNode call = created.body().path("calls").get(0);
		assertThat(call.path("operation").asString()).isEqualTo("create_payment");
		assertThat(call.path("httpStatus").asInt()).isEqualTo(201);
		assertThat(call.path("request").asString()).contains(ref).contains("/api/billpay/lab-return?ref=" + ref);

		BillPayFake.paymentStatus(billPay, paymentId, ref, new BigDecimal("25.00"), "CAPTURED", null);
		JsonNode refreshed = post("/api/admin/billpay-lab/" + id + "/refresh", Map.of(), admin).body();
		assertThat(refreshed.path("run").path("status").asString()).isEqualTo("CAPTURED");

		sendWebhook(BillPayFake.capturedWebhook(paymentId, ref, new BigDecimal("25.00")));
		await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(
				get("/api/admin/billpay-lab/" + id, admin).body().path("webhooks").size()).isEqualTo(1));
		JsonNode hook = get("/api/admin/billpay-lab/" + id, admin).body().path("webhooks").get(0);
		assertThat(hook.path("signatureValid").asBoolean()).isTrue();

		BillPayFake.acceptsRefunds(billPay);
		JsonNode refunded = post("/api/admin/billpay-lab/" + id + "/refund", Map.of("amount", 10, "reason", "lab"), admin).body();
		JsonNode last = refunded.path("calls").get(refunded.path("calls").size() - 1);
		assertThat(last.path("operation").asString()).isEqualTo("create_refund");
		assertThat(last.path("httpStatus").asInt()).isEqualTo(202);
		assertThat(last.path("request").asString()).isEqualTo("{\"amount\":10.00,\"reason\":\"lab\"}");

		assertThat(get("/api/admin/billpay-lab", admin).raw()).contains(ref);
		// BillPay's return link lands on the lab page; foreign values are not passed on
		Res back = get("/api/billpay/lab-return?ref=" + ref);
		assertThat(back.status()).isIn(200, 302);
	}

	@Test
	void livePaymentsNeedAConfirmAndStayUnderTheCap() {
		String admin = adminToken();
		Res noConfirm = post("/api/admin/billpay-lab", Map.of("environment", "LIVE", "amount", 5), admin);
		assertThat(noConfirm.status()).isEqualTo(400);
		assertThat(noConfirm.text("code")).isEqualTo("CONFIRM_LIVE");
		Res tooMuch = post("/api/admin/billpay-lab", Map.of("environment", "LIVE", "amount", 5000, "confirmLive", true), admin);
		assertThat(tooMuch.text("code")).isEqualTo("LIVE_AMOUNT_TOO_HIGH");
		assertThat(post("/api/admin/billpay-lab", Map.of("environment", "SANDBOX", "amount", 0.5), admin).text("code"))
				.isEqualTo("AMOUNT_INVALID");
	}
}
