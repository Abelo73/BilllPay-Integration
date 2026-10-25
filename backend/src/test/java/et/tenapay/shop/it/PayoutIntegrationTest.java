package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * Sodo Gebeya M6: the buyer's money is held per seller parcel, released when the buyer confirms receipt, and paid out to
 * sellers on request; commission follows the most specific rule.
 */
class PayoutIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("M6 Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
	}

	@AfterEach
	void defaultCommissionBackToZero() {
		put("/api/admin/commission-rules", Map.of("percent", 0), admin);
	}

	private record Seller(String token, long shopId, long productId) {
	}

	private Seller seller(String price) {
		String token = post("/api/auth/register", Map.of("fullName", "Payout Seller", "email", unique("m6") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Payout Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Payout item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal(price));
		req.put("stock", 20);
		req.put("active", true);
		long productId = post("/api/seller/products", req, token).body().path("product").path("id").asLong();
		return new Seller(token, shopId, productId);
	}

	private String buyAndPay(long productId) {
		String buyer = shopperToken();
		Res r = post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", productId, "quantity", 1)),
				"customer", Map.of("name", "Hana Girma", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "University area", "city", "Wolaita Sodo")), buyer);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String n = r.text("orderNumber");
		BigDecimal total = get("/api/orders/" + n + "/status", buyer).body().path("total").decimalValue();
		sendWebhook(BillPayFake.capturedWebhook("pay-" + n + "-A1", n + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).until(() -> "PAID".equals(get("/api/orders/" + n + "/status", buyer).text("status")));
		return n;
	}

	private JsonNode money(Seller s) {
		return get("/api/seller/money", s.token()).body();
	}

	private BigDecimal bal(Seller s, String field) {
		return money(s).path("balance").path(field).decimalValue();
	}

	@Test
	void heldUntilReceived_thenPaidOut() {
		assertThat(put("/api/admin/commission-rules", Map.of("percent", 5), admin).status()).isEqualTo(200);
		Seller s = seller("1000.00");
		String n = buyAndPay(s.productId());

		// held: items 1000 + delivery 150 - 5% of the items
		assertThat(bal(s, "held")).isEqualByComparingTo("1100.00");
		assertThat(bal(s, "available")).isEqualByComparingTo("0");
		JsonNode line = get("/api/seller/money/statement", s.token()).body().path("content").get(0);
		assertThat(line.path("commission").decimalValue()).isEqualByComparingTo("50.00");
		assertThat(line.path("payoutStatus").asString()).isEqualTo("HELD");

		// the buyer can't confirm before it's sent; after "on the way" they can, and the money is released at once
		String buyer = shopperToken();
		assertThat(post("/api/orders/" + n + "/parcels/1/received", Map.of(), buyer).status()).isEqualTo(409);
		post("/api/seller/orders/" + n + "/fulfilment", Map.of("status", "SHIPPED"), s.token());
		assertThat(get("/api/orders/" + n + "/status", buyer).body().path("parcels").get(0).path("canConfirmReceipt").asBoolean()).isTrue();
		Res received = post("/api/orders/" + n + "/parcels/1/received", Map.of(), buyer);
		assertThat(received.status()).as(received.raw()).isEqualTo(200);
		assertThat(received.body().path("delivery").path("fulfilmentStatus").asString()).isEqualTo("DELIVERED");
		assertThat(bal(s, "held")).isEqualByComparingTo("0");
		assertThat(bal(s, "available")).isEqualByComparingTo("1100.00");

		// payout rules
		assertThat(post("/api/seller/money/payouts", Map.of("amount", 500), s.token()).text("code")).isEqualTo("NO_PAYOUT_ACCOUNT");
		assertThat(put("/api/seller/money/account", Map.of("method", "TELEBIRR", "accountName", "Payout Seller",
				"account", "0912 345 678"), s.token()).status()).isEqualTo(200);
		assertThat(post("/api/seller/money/payouts", Map.of("amount", 50), s.token()).text("code")).isEqualTo("BELOW_MINIMUM");
		assertThat(post("/api/seller/money/payouts", Map.of("amount", 5000), s.token()).text("code")).isEqualTo("MORE_THAN_AVAILABLE");
		Res asked = post("/api/seller/money/payouts", Map.of("amount", 600), s.token());
		assertThat(asked.status()).as(asked.raw()).isEqualTo(200);
		assertThat(post("/api/seller/money/payouts", Map.of("amount", 100), s.token()).text("code")).isEqualTo("PAYOUT_PENDING");
		assertThat(bal(s, "available")).isEqualByComparingTo("500.00");

		// staff send it with a reference; the seller is told
		long payoutId = asked.body().path("id").asLong();
		JsonNode queue = get("/api/admin/payouts?status=REQUESTED", admin).body();
		assertThat(queue.path("page").path("content").toString()).contains("\"id\":" + payoutId).contains("0912345678");
		assertThat(post("/api/admin/payouts/" + payoutId + "/decision", Map.of("status", "PAID"), admin).status()).isEqualTo(400);
		assertThat(post("/api/admin/payouts/" + payoutId + "/decision", Map.of("status", "PAID", "reference", "TB123456"), admin)
				.status()).isEqualTo(200);
		assertThat(bal(s, "paidOut")).isEqualByComparingTo("600.00");
		await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
				assertThat(get("/api/admin/sms?q=912345678", admin).raw()).contains("we sent you 600.00 ETB"));

		// a rejected payout puts the money back
		long second = post("/api/seller/money/payouts", Map.of("amount", 500), s.token()).body().path("id").asLong();
		assertThat(bal(s, "available")).isEqualByComparingTo("0");
		assertThat(post("/api/admin/payouts/" + second + "/decision", Map.of("status", "REJECTED", "note", "Wrong number"), admin)
				.status()).isEqualTo(200);
		assertThat(bal(s, "available")).isEqualByComparingTo("500.00");
		assertThat(get("/api/admin/payouts.csv", admin).raw()).contains("TB123456");
	}

	@Test
	void mostSpecificCommissionRuleWins_andCancelledParcelsEarnNothing() {
		Seller s = seller("2000.00");
		put("/api/admin/commission-rules", Map.of("percent", 5), admin);
		put("/api/admin/commission-rules", Map.of("categoryId", categoryId, "percent", 8), admin);
		put("/api/admin/commission-rules", Map.of("shopId", s.shopId(), "percent", 3), admin);
		Seller other = seller("2000.00");

		buyAndPay(s.productId());
		buyAndPay(other.productId());
		// seller rule (3%) beats the category rule; the other seller gets the category rule (8%)
		assertThat(get("/api/seller/money/statement", s.token()).body().path("content").get(0).path("commission").decimalValue())
				.isEqualByComparingTo("60.00");
		assertThat(get("/api/seller/money/statement", other.token()).body().path("content").get(0).path("commission").decimalValue())
				.isEqualByComparingTo("160.00");
		assertThat(put("/api/admin/commission-rules", Map.of("percent", 60), admin).status()).isEqualTo(400);

		// delivered by staff today: still held (48 h to complain); cancelled: earns nothing
		String n2 = buyAndPay(s.productId());
		post("/api/admin/orders/" + n2 + "/fulfilment", Map.of("status", "SHIPPED"), admin);
		post("/api/admin/orders/" + n2 + "/fulfilment", Map.of("status", "DELIVERED"), admin);
		post("/api/admin/payouts/release-due", Map.of(), admin);
		String n3 = buyAndPay(s.productId());
		post("/api/admin/orders/" + n3 + "/fulfilment", Map.of("status", "CANCELLED", "note", "Out of stock"), admin);
		JsonNode lines = get("/api/seller/money/statement", s.token()).body().path("content");
		assertThat(lines.get(0).path("payoutStatus").asString()).isEqualTo("CANCELLED");
		assertThat(lines.get(1).path("payoutStatus").asString()).isEqualTo("HELD");
		assertThat(bal(s, "held")).isEqualByComparingTo("4180.00"); // 2 parcels x (2000 items + 150 delivery - 60 commission)
		assertThat(get("/api/admin/payouts", admin).body().path("totals").path("commission").decimalValue())
				.isGreaterThanOrEqualTo(new BigDecimal("280.00"));

		// sellers never reach staff pages, and only see their own money
		assertThat(get("/api/admin/payouts", s.token()).status()).isEqualTo(403);
		assertThat(get("/api/seller/money", other.token()).body().path("balance").path("held").decimalValue())
				.isEqualByComparingTo("1990.00");
	}
}
