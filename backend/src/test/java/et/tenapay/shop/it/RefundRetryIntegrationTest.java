package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
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
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/**
 * A refund is money owed until it is back with the buyer (guide sections 6 and 7): a refusal or no answer from BillPay
 * doesn't end it. Temporary failures are sent again on their own (a new key after a refusal, the same key after no
 * answer); the rest wait for staff, who try again, record a payment made another way, or cancel it.
 */
class RefundRetryIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("500.00"), 50);
		BillPayFake.acceptsEveryPayment(billPay);
	}

	private record Paid(String number, String paymentId, String buyer) {
	}

	private Paid paidOrder() {
		String buyer = shopperToken();
		Res r = post("/api/checkout", checkoutBody(productId, 1, "0911223344"), buyer);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String n = r.text("orderNumber");
		BigDecimal total = get("/api/orders/" + n + "/status", buyer).body().path("total").decimalValue();
		String paymentId = "pay-" + n + "-A1";
		sendWebhook(BillPayFake.capturedWebhook(paymentId, n + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).until(() -> "PAID".equals(get("/api/orders/" + n + "/status", buyer).text("status")));
		return new Paid(n, paymentId, buyer);
	}

	private JsonNode refund(String number, String amount) {
		Res r = post("/api/admin/orders/" + number + "/refunds", Map.of("amount", amount, "reason", "test"), admin);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body();
	}

	/** Makes the refund's wait over, as if its time had come. */
	private void dueNow(String refundId) {
		jdbc.update("update refunds set next_try_at = now() - interval '1 minute' where id = ?", UUID.fromString(refundId));
	}

	private List<String> keysSent(String paymentId) {
		return billPay.findAll(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH + "/" + paymentId + "/refunds")))
				.stream().map(q -> q.getHeader("Idempotency-Key")).toList();
	}

	private String orderStatus(Paid p) {
		return get("/api/orders/" + p.number() + "/status", p.buyer()).text("status");
	}

	@Test
	void refusedForGood_waitsForStaff_whoPayByHand() {
		Paid p = paidOrder();
		BillPayFake.refundsRefused(billPay, p.paymentId());
		JsonNode r = refund(p.number(), "100.00");
		String id = r.path("id").asString();
		assertThat(r.path("status").asString()).isEqualTo("NEEDS_STAFF");
		assertThat(r.path("needsStaffWhy").asString()).contains("REFUND_REFUSED");
		assertThat(r.path("nextTryAt").isNull()).as("not retried on its own").isTrue();
		assertThat(get("/api/admin/refunds/needs-staff", admin).raw()).contains(id);
		assertThat(get("/api/me/inbox", p.buyer()).raw()).contains("Your refund is delayed");

		JsonNode attempts = get("/api/admin/refunds/" + id + "/attempts", admin).body();
		assertThat(attempts.size()).isEqualTo(1);
		assertThat(attempts.get(0).path("outcome").asString()).isEqualTo("REFUSED");

		// the amount stays reserved: no second refund past what's left
		assertThat(post("/api/admin/orders/" + p.number() + "/refunds", Map.of("amount", "9999.00"), admin).text("code"))
				.isEqualTo("REFUND_AMOUNT_INVALID");

		assertThat(post("/api/admin/refunds/" + id + "/paid-by-hand", Map.of("note", "x"), admin).text("code"))
				.isEqualTo("REFERENCE_REQUIRED");
		JsonNode done = post("/api/admin/refunds/" + id + "/paid-by-hand",
				Map.of("reference", "CBE FT26302ABC", "note", "Sent from the shop's CBE account"), admin).body();
		assertThat(done.path("status").asString()).isEqualTo("PAID_BY_HAND");
		assertThat(done.path("manualReference").asString()).isEqualTo("CBE FT26302ABC");
		assertThat(orderStatus(p)).isEqualTo("PARTIALLY_REFUNDED");
		assertThat(get("/api/admin/refunds/needs-staff", admin).raw()).doesNotContain(id);
		assertThat(post("/api/admin/refunds/" + id + "/cancel", Map.of("note", "x"), admin).text("code"))
				.isEqualTo("REFUND_NOT_CLOSABLE");
	}

	@Test
	void refundLimit_isRetriedOnItsOwn_withANewKey() {
		Paid p = paidOrder();
		BillPayFake.refundsBlocked(billPay, p.paymentId());
		JsonNode r = refund(p.number(), "150.00");
		String id = r.path("id").asString();
		assertThat(r.path("status").asString()).isEqualTo("RETRY_LATER");
		assertThat(r.path("nextTryAt").asString()).isNotBlank();

		// not due yet: nothing is sent
		post("/api/admin/refunds/run-retries", Map.of(), admin);
		assertThat(keysSent(p.paymentId())).hasSize(1);

		BillPayFake.acceptsRefunds(billPay); // settlement cleared the limit
		dueNow(id);
		assertThat(post("/api/admin/refunds/run-retries", Map.of(), admin).status()).isEqualTo(200); // the 2-minute job may also have run

		List<String> keys = keysSent(p.paymentId());
		assertThat(keys).hasSize(2);
		assertThat(keys.get(1)).as("a refusal is not replayed: new key").isNotEqualTo(keys.get(0));
		JsonNode attempts = get("/api/admin/refunds/" + id + "/attempts", admin).body();
		assertThat(attempts.get(1).path("outcome").asString()).isEqualTo("ACCEPTED");
		assertThat(statusOf(id)).isEqualTo("PENDING");
	}

	@Test
	void noAnswer_isResentWithTheSameKey_soItCantRefundTwice() {
		Paid p = paidOrder();
		BillPayFake.refundsDown(billPay, p.paymentId());
		JsonNode r = refund(p.number(), "120.00");
		String id = r.path("id").asString();
		assertThat(r.path("status").asString()).isEqualTo("ERROR");
		assertThat(r.path("nextTryAt").asString()).isNotBlank();
		assertThat(post("/api/admin/refunds/" + id + "/paid-by-hand", Map.of("reference", "x"), admin).text("code"))
				.as("BillPay may still send it").isEqualTo("REFUND_NOT_CLOSABLE");

		BillPayFake.acceptsRefunds(billPay);
		dueNow(id);
		post("/api/admin/refunds/run-retries", Map.of(), admin);
		List<String> keys = keysSent(p.paymentId());
		assertThat(keys).hasSize(2);
		assertThat(keys.get(1)).isEqualTo(keys.get(0));
		assertThat(statusOf(id)).isEqualTo("PENDING");
	}

	@Test
	void staffCancel_freesTheAmount() {
		Paid p = paidOrder();
		BillPayFake.refundsRefused(billPay, p.paymentId());
		String id = refund(p.number(), "100.00").path("id").asString();
		assertThat(post("/api/admin/refunds/" + id + "/cancel", Map.of(), admin).text("code")).isEqualTo("NOTE_REQUIRED");
		JsonNode c = post("/api/admin/refunds/" + id + "/cancel", Map.of("note", "Buyer kept the item"), admin).body();
		assertThat(c.path("status").asString()).isEqualTo("CANCELLED");

		BillPayFake.acceptsRefunds(billPay);
		BigDecimal total = get("/api/orders/" + p.number() + "/status", p.buyer()).body().path("total").decimalValue();
		assertThat(refund(p.number(), total.toPlainString()).path("status").asString())
				.as("the whole amount can be refunded again").isEqualTo("PENDING");
	}

	@Test
	void staffRetryAfterRefusal_andALateRefundedWebhookStillCounts() {
		Paid p = paidOrder();
		BillPayFake.refundsRefused(billPay, p.paymentId());
		BigDecimal total = get("/api/orders/" + p.number() + "/status", p.buyer()).body().path("total").decimalValue();
		String id = refund(p.number(), total.toPlainString()).path("id").asString();
		assertThat(statusOf(id)).isEqualTo("NEEDS_STAFF");

		BillPayFake.acceptsRefunds(billPay);
		JsonNode again = post("/api/admin/refunds/" + id + "/retry", Map.of(), admin).body();
		assertThat(again.path("status").asString()).isEqualTo("PENDING");
		assertThat(again.path("attempts").asInt()).isEqualTo(2);

		sendWebhook("""
				{"eventId":"%s","eventType":"PaymentRefunded","occurredAt":"2026-10-29T10:00:00Z","data":{"refund":{"paymentId":"%s","status":"COMPLETED","amount":%s}}}
				""".formatted(UUID.randomUUID(), p.paymentId(), total.toPlainString()));
		await().atMost(Duration.ofSeconds(30)).until(() -> "SUCCEEDED".equals(statusOf(id)));
		assertThat(orderStatus(p)).isEqualTo("REFUNDED");
	}

	@Test
	void stuckInReviewOver24Hours_showsOnTheStaffList() {
		Paid p = paidOrder();
		BillPayFake.acceptsRefunds(billPay);
		String id = refund(p.number(), "50.00").path("id").asString();
		assertThat(statusOf(id)).isEqualTo("PENDING");
		assertThat(get("/api/admin/refunds/needs-staff", admin).raw()).doesNotContain(id);

		jdbc.update("update refunds set updated_at = now() - interval '25 hours' where id = ?", UUID.fromString(id));
		assertThat(post("/api/admin/refunds/run-retries", Map.of(), admin).status()).isEqualTo(200); // the 2-minute job may also have run
		assertThat(get("/api/admin/refunds/needs-staff", admin).raw()).contains(id).contains("over 24 hours");
	}

	private String statusOf(String refundId) {
		for (JsonNode r : get("/api/admin/refunds?size=100", admin).body().path("content")) {
			if (refundId.equals(r.path("id").asString())) {
				return r.path("status").asString();
			}
		}
		throw new AssertionError("refund " + refundId + " not listed");
	}
}
