package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/** Reviews only from buyers who received the item; seller replies once; staff can hide. */
class ReviewIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Review Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
	}

	private record Seller(String token, String slug, long productId) {
	}

	private Seller seller() {
		Res reg = post("/api/auth/register", Map.of("fullName", "Tigist Seller", "email", unique("rev") + "@it.test",
				"phone", "0913000000", "password", "Review-pass-2026"));
		String token = reg.text("token");
		JsonNode shop = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Tigist Kids"), "phone", "0913000000",
				"area", "Arada", "description", "Kids"), token).body();
		Map<String, Object> product = new LinkedHashMap<>();
		product.put("name", unique("School shoes"));
		product.put("categoryId", categoryId);
		product.put("price", new BigDecimal("900.00"));
		product.put("stock", 10);
		product.put("lowStockThreshold", 1);
		product.put("active", true);
		long productId = post("/api/seller/products", product, token).body().path("product").path("id").asLong();
		assertThat(post("/api/admin/shops/" + shop.path("id").asLong() + "/decision", Map.of("status", "APPROVED"), admin).status()).isEqualTo(200);
		return new Seller(token, shop.path("slug").asString(), productId);
	}

	/** The shared test shopper buys it and pays; returns the order number. */
	private String buy(long productId) {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res r = post("/api/checkout", checkoutBody(productId, 1, "0933000111"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String orderNumber = r.text("orderNumber");
		String total = jdbc.queryForObject("select total from orders where order_number = ?", String.class, orderNumber);
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal(total)));
		await().atMost(Duration.ofSeconds(30)).until(() -> "PAID".equals(
				jdbc.queryForObject("select status from orders where order_number = ?", String.class, orderNumber)));
		return orderNumber;
	}

	private long itemId(String orderNumber) {
		return jdbc.queryForObject("select i.id from order_items i join orders o on o.id = i.order_id where o.order_number = ?",
				Long.class, orderNumber);
	}

	private void deliver(String orderNumber) {
		assertThat(post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "SHIPPED"), admin).status()).isEqualTo(200);
		assertThat(post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "DELIVERED"), admin).status()).isEqualTo(200);
	}

	@Test
	void onlyDeliveredItemsCanBeReviewedOnceThenSellerRepliesAndStaffCanHide() {
		Seller s = seller();
		String buyer = shopperToken();
		String orderNumber = buy(s.productId());
		long item = itemId(orderNumber);

		Res early = post("/api/reviews", Map.of("orderItemId", item, "rating", 5), buyer);
		assertThat(early.status()).isEqualTo(409);
		assertThat(early.text("code")).isEqualTo("NOT_DELIVERED");

		deliver(orderNumber);
		JsonNode waiting = get("/api/me/reviewable", buyer).body();
		assertThat(waiting.findValuesAsString("orderNumber")).contains(orderNumber);

		// someone else can't review your item
		String stranger = post("/api/auth/register", Map.of("fullName", "Stranger", "email", unique("x") + "@it.test",
				"phone", "0913999999", "password", "Review-pass-2026")).text("token");
		assertThat(post("/api/reviews", Map.of("orderItemId", item, "rating", 1), stranger).status()).isEqualTo(404);

		Res ok = post("/api/reviews", Map.of("orderItemId", item, "rating", 4, "body", "Good shoes, fast delivery."), buyer);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		long reviewId = ok.body().path("id").asLong();
		assertThat(ok.body().path("authorName").asString()).doesNotContain("  ").matches("\\S+( \\S\\.)?");
		assertThat(post("/api/reviews", Map.of("orderItemId", item, "rating", 5), buyer).text("code")).isEqualTo("ALREADY_REVIEWED");
		assertThat(get("/api/me/reviewable", buyer).body().findValuesAsString("orderNumber")).doesNotContain(orderNumber);

		JsonNode product = get("/api/products/" + s.productId() + "/reviews").body();
		assertThat(product.path("summary").path("count").asLong()).isEqualTo(1);
		assertThat(product.path("summary").path("average").decimalValue()).isEqualByComparingTo("4.0");
		assertThat(product.path("summary").path("stars").path("4").asLong()).isEqualTo(1);
		assertThat(get("/api/shops/" + s.slug() + "/reviews").body().path("summary").path("count").asLong()).isEqualTo(1);

		Res reply = post("/api/seller/reviews/" + reviewId + "/reply", Map.of("text", "Thank you, Hana!"), s.token());
		assertThat(reply.status()).as(reply.raw()).isEqualTo(200);
		assertThat(reply.body().path("sellerReply").asString()).isEqualTo("Thank you, Hana!");
		assertThat(post("/api/seller/reviews/" + reviewId + "/reply", Map.of("text", "again"), s.token()).text("code")).isEqualTo("ALREADY_REPLIED");
		assertThat(post("/api/seller/reviews/" + reviewId + "/reply", Map.of("text", "not my shop"), stranger).status()).isEqualTo(404);

		assertThat(post("/api/admin/reviews/" + reviewId + "/hide", Map.of("hidden", true, "reason", "test"), admin).status()).isEqualTo(200);
		assertThat(get("/api/products/" + s.productId() + "/reviews").body().path("summary").path("count").asLong()).isZero();
		assertThat(get("/api/seller/reviews", s.token()).body().path("reviews").path("content").get(0).path("hidden").asBoolean()).isTrue();
	}
}
