package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/**
 * M7 cash on delivery: only when switched on, for verified sellers and under the limit; no BillPay; stock taken and
 * delivery starts at once; "Cash received" marks it delivered, charges the commission to the seller's balance and
 * makes the order PAID; cancelling refunds nothing (nothing was paid) and puts the items back.
 */
class CashOnDeliveryIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Cash Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
	}

	@AfterEach
	void switchesBack() {
		put("/api/admin/features/cash_on_delivery", Map.of("value", "false"), admin);
		put("/api/admin/features/cash_limit", Map.of("value", "5000"), admin);
	}

	private record Seller(String token, long shopId, long productId) {
	}

	private Seller seller(boolean verified) {
		String token = post("/api/auth/register", Map.of("fullName", "Cash Seller", "email", unique("cod") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Cash Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		if (verified) {
			jdbc.update("update shops set verified_at = now() where id = ?", shopId);
		}
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Cash item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("1000.00"));
		req.put("stock", 20);
		req.put("active", true);
		long productId = post("/api/seller/products", req, token).body().path("product").path("id").asLong();
		return new Seller(token, shopId, productId);
	}

	private Res checkoutCash(long productId) {
		return post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", productId, "quantity", 1)),
				"customer", Map.of("name", "Hana Girma", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "University area", "city", "Wolaita Sodo"),
				"paymentMethod", "CASH"), shopperToken());
	}

	private JsonNode status(String n) {
		return get("/api/orders/" + n + "/status", shopperToken()).body();
	}

	@Test
	void cashOnlyWhenSwitchedOn_forVerifiedSellers_underTheLimit() {
		Seller unverified = seller(false);
		assertThat(checkoutCash(unverified.productId()).text("code")).isEqualTo("CASH_OFF");

		put("/api/admin/features/cash_on_delivery", Map.of("value", "true"), admin);
		assertThat(checkoutCash(unverified.productId()).text("code")).isEqualTo("CASH_UNVERIFIED_SELLER");

		Seller verified = seller(true);
		put("/api/admin/features/cash_limit", Map.of("value", "500"), admin);
		assertThat(checkoutCash(verified.productId()).text("code")).isEqualTo("CASH_OVER_LIMIT");
		assertThat(adminProduct(verified.productId(), admin).path("reserved").asInt()).as("nothing held").isZero();
	}

	@Test
	void cashOrder_noBillPay_sellerCollects_commissionChargedToBalance() {
		put("/api/admin/features/cash_on_delivery", Map.of("value", "true"), admin);
		Seller s = seller(true);
		jdbc.update("insert into commission_rules (shop_id, percent, note) values (?, 10, 'cash test')", s.shopId());

		Res r = checkoutCash(s.productId());
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String n = r.text("orderNumber");
		assertThat(r.body().path("checkoutUrl").isNull()).as("no BillPay page").isTrue();
		assertThat(r.text("paymentMethod")).isEqualTo("CASH");
		billPay.verify(0, postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH)));

		JsonNode st = status(n);
		assertThat(st.path("status").asString()).isEqualTo("CASH_ON_DELIVERY");
		assertThat(st.path("paymentMethod").asString()).isEqualTo("CASH");
		assertThat(st.path("canRetry").asBoolean()).as("nothing to pay online").isFalse();
		assertThat(st.path("payBy").isNull()).as("never expires").isTrue();
		assertThat(adminProduct(s.productId(), admin).path("stock").asInt()).as("stock taken at once").isEqualTo(19);

		// the seller sees it straight away, with what to collect
		JsonNode detail = get("/api/seller/orders/" + n, s.token()).body().path("order");
		assertThat(detail.path("cash").asBoolean()).isTrue();
		assertThat(detail.path("collect").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(detail.path("nextSteps").toString()).doesNotContain("DELIVERED");
		assertThat(post("/api/seller/orders/" + n + "/fulfilment", Map.of("status", "SHIPPED"), s.token()).status()).isEqualTo(200);
		assertThat(post("/api/seller/orders/" + n + "/fulfilment", Map.of("status", "DELIVERED"), s.token()).text("code"))
				.isEqualTo("USE_CASH_RECEIVED");

		JsonNode got = post("/api/seller/orders/" + n + "/cash-received", Map.of(), s.token()).body();
		assertThat(got.path("collected").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(got.path("commission").decimalValue()).isEqualByComparingTo("100.00");
		assertThat(got.path("orderPaid").asBoolean()).isTrue();
		assertThat(status(n).path("status").asString()).isEqualTo("PAID");
		assertThat(status(n).path("delivery").path("fulfilmentStatus").asString()).isEqualTo("DELIVERED");

		// the seller kept 1150 in cash, so our 100 commission is owed on their balance
		JsonNode bal = get("/api/seller/money", s.token()).body().path("balance");
		assertThat(bal.path("available").decimalValue()).isEqualByComparingTo("-100.00");
		assertThat(bal.path("held").decimalValue()).isEqualByComparingTo("0");
		assertThat(post("/api/seller/orders/" + n + "/cash-received", Map.of(), s.token()).text("code")).isEqualTo("ALREADY_COLLECTED");
	}

	@Test
	void staffRecordTheCash_fromTheAdminOrderPage() {
		put("/api/admin/features/cash_on_delivery", Map.of("value", "true"), admin);
		Seller s = seller(true);
		String n = checkoutCash(s.productId()).text("orderNumber");

		JsonNode d = get("/api/admin/orders/" + n, admin).body();
		assertThat(d.path("order").path("paymentMethod").asString()).isEqualTo("CASH");
		JsonNode parcel = d.path("parcels").get(0);
		assertThat(parcel.path("cashToCollect").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(parcel.path("cashCollectedAt").isNull()).isTrue();

		JsonNode got = post("/api/admin/orders/" + n + "/parcels/1/cash-received", Map.of(), admin).body();
		assertThat(got.path("collected").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(got.path("orderPaid").asBoolean()).isTrue();
		JsonNode after = get("/api/admin/orders/" + n, admin).body();
		assertThat(after.path("order").path("status").asString()).isEqualTo("PAID");
		assertThat(after.path("parcels").get(0).path("cashCollectedAt").isNull()).isFalse();
		assertThat(after.path("parcels").get(0).path("fulfilmentStatus").asString()).isEqualTo("DELIVERED");
		// a second click is refused, so cash is never counted twice
		assertThat(post("/api/admin/orders/" + n + "/parcels/1/cash-received", Map.of(), admin).text("code")).isEqualTo("ALREADY_COLLECTED");
	}

	@Test
	void cancellingACashOrder_refundsNothing_andPutsItemsBack() {
		put("/api/admin/features/cash_on_delivery", Map.of("value", "true"), admin);
		Seller s = seller(true);
		String n = checkoutCash(s.productId()).text("orderNumber");
		assertThat(adminProduct(s.productId(), admin).path("stock").asInt()).isEqualTo(19);

		JsonNode c = post("/api/orders/" + n + "/parcels/1/cancel", Map.of("reason", "Changed my mind"), shopperToken()).body();
		assertThat(c.path("refunded").decimalValue()).isEqualByComparingTo("0");
		assertThat(c.path("refundStatus").asString()).isEqualTo("CASH_NOT_COLLECTED");
		assertThat(status(n).path("status").asString()).isEqualTo("CANCELLED");
		assertThat(adminProduct(s.productId(), admin).path("stock").asInt()).as("back on sale").isEqualTo(20);
		assertThat(get("/api/admin/refunds", admin).raw()).doesNotContain(n);
		assertThat(post("/api/seller/orders/" + n + "/cash-received", Map.of(), s.token()).text("code")).isEqualTo("PARCEL_CANCELLED");
	}
}
