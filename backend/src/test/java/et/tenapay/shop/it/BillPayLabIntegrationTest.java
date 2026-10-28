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
	void keyCheckTellsAcceptedFromRejectedAndStatsCountTheCalls() {
		String admin = adminToken();
		// a made-up payment: BillPay says "not found" when it accepts the key
		billPay.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(
				com.github.tomakehurst.wiremock.client.WireMock.urlMatching(".*/payments/00000000-0000-0000-0000-000000000000"))
				.withHeader("x-api-key", com.github.tomakehurst.wiremock.client.WireMock.equalTo("test-api-key"))
				.willReturn(com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(404)
						.withHeader("Content-Type", "application/json").withBody("{\"statusCode\":404,\"message\":\"Payment not found\"}")));
		billPay.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(
				com.github.tomakehurst.wiremock.client.WireMock.urlMatching(".*/payments/00000000-0000-0000-0000-000000000000"))
				.withHeader("x-api-key", com.github.tomakehurst.wiremock.client.WireMock.equalTo(LIVE_API_KEY))
				.willReturn(com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(401)
						.withHeader("Content-Type", "application/json").withBody("{\"statusCode\":401,\"message\":\"Invalid API key\"}")));

		Res checked = post("/api/admin/billpay-lab/key-check", Map.of(), admin);
		assertThat(checked.status()).as(checked.raw()).isEqualTo(200);
		Map<String, String> verdicts = new java.util.HashMap<>();
		checked.body().forEach(k -> verdicts.put(k.path("environment").asString(), k.path("verdict").asString()));
		assertThat(verdicts).containsEntry("SANDBOX", "OK").containsEntry("LIVE", "KEY_REJECTED");
		// only admins may call BillPay from the lab
		assertThat(post("/api/admin/billpay-lab/key-check", Map.of(), shopperToken()).status()).isIn(401, 403);

		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		post("/api/admin/billpay-lab", Map.of("environment", "SANDBOX", "amount", 12), admin);
		JsonNode stats = get("/api/admin/billpay-lab/stats", admin).body();
		JsonNode create = null;
		for (JsonNode op : stats.path("operations")) {
			if (op.path("environment").asString().equals("SANDBOX") && op.path("operation").asString().equals("create_payment")) {
				create = op;
			}
		}
		assertThat(create).isNotNull();
		assertThat(create.path("calls").asInt()).isGreaterThanOrEqualTo(1);
		assertThat(create.path("ok").asInt()).isGreaterThanOrEqualTo(1);
		assertThat(stats.path("outcomes").size()).isGreaterThanOrEqualTo(1);
	}

	@Test
	void scenarioRunMarksEachBillPayCasePassedFailedOrWaiting() {
		String admin = adminToken();
		BillPayFake.acceptsEveryPayment(billPay);
		JsonNode board = post("/api/admin/billpay-lab/scenarios", Map.of(), admin).body();
		assertThat(board.path("rows").size()).isEqualTo(8);
		Map<String, JsonNode> rows = new java.util.HashMap<>();
		board.path("rows").forEach(r -> rows.put(r.path("key").asString(), r));
		rows.values().forEach(r -> assertThat(r.path("verdict").asString()).as(r.toString()).isEqualTo("WAITING"));
		assertThat(rows.get("INSUFFICIENT_FUNDS").path("howTo").asString()).contains("0000");

		// refunds need the "Paid" case first
		assertThat(post("/api/admin/billpay-lab/scenarios/refunds", Map.of(), admin).text("code")).isEqualTo("PAY_FIRST");

		// what the tester did on BillPay's page: paid; typed …0000; and for "declines" paid by mistake
		stubStatus(rows.get("PAID"), "CAPTURED", null);
		stubStatus(rows.get("INSUFFICIENT_FUNDS"), "CREATED", "INSUFFICIENT_FUNDS");
		stubStatus(rows.get("CUSTOMER_DECLINED"), "CAPTURED", null);
		JsonNode checked = post("/api/admin/billpay-lab/scenarios/check", Map.of(), admin).body();
		Map<String, String> verdicts = new java.util.HashMap<>();
		checked.path("rows").forEach(r -> verdicts.put(r.path("key").asString(), r.path("verdict").asString()));
		assertThat(verdicts).containsEntry("PAID", "PASS").containsEntry("INSUFFICIENT_FUNDS", "PASS")
				.containsEntry("CUSTOMER_DECLINED", "FAIL").containsEntry("NO_ANSWER", "WAITING");
		assertThat(checked.path("passed").asInt()).isEqualTo(2);
		assertThat(checked.path("failed").asInt()).isEqualTo(1);

		// refunds: 1.00 accepted, 1.13 refused (as the sandbox does)
		BillPayFake.acceptsRefunds(billPay);
		billPay.stubFor(com.github.tomakehurst.wiremock.client.WireMock.post(
				com.github.tomakehurst.wiremock.client.WireMock.urlMatching(".*/payments/[^/]+/refunds")).atPriority(2)
				.withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing("1.13"))
				.willReturn(com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(422)
						.withHeader("Content-Type", "application/json")
						.withBody("{\"statusCode\":422,\"message\":\"REFUND_REFUSED\"}")));
		JsonNode refunds = post("/api/admin/billpay-lab/scenarios/refunds", Map.of(), admin).body().path("refunds");
		Map<String, String> refundVerdicts = new java.util.HashMap<>();
		refunds.forEach(r -> refundVerdicts.put(r.path("key").asString(), r.path("verdict").asString()));
		assertThat(refundVerdicts).containsEntry("REFUND_OK", "PASS").containsEntry("REFUND_REFUSED", "PASS");

		// reading the board is open to staff, starting a run is admin-only
		assertThat(post("/api/admin/billpay-lab/scenarios", Map.of(), shopperToken()).status()).isIn(401, 403);
	}

	private static void stubStatus(JsonNode row, String status, String failureCode) {
		String ref = row.path("merchantReference").asString();
		BillPayFake.paymentStatus(billPay, "pay-" + ref, ref, new BigDecimal("25.00"), status, failureCode);
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
