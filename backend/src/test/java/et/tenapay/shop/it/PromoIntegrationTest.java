package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** M16 boosts, M17 the Pro shop plan and home banners: request, staff confirm, and what changes in the store. */
class PromoIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Promo Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
	}

	@AfterEach
	void defaults() {
		put("/api/admin/features/free_plan_max_products", Map.of("value", "20"), admin);
	}

	private String seller() {
		String token = post("/api/auth/register", Map.of("fullName", "Promo Seller", "email", unique("promo") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Promo Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		return token;
	}

	private Res product(String token, String name) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("500.00"));
		req.put("stock", 3);
		req.put("active", true);
		return post("/api/seller/products", req, token);
	}

	@Test
	void boostPutsAListingOnTop() {
		String s = seller();
		String tag = unique("b").substring(2);
		long first = product(s, "Boost first " + tag).body().path("product").path("id").asLong();
		long second = product(s, "Boost second " + tag).body().path("product").path("id").asLong();

		assertThat(post("/api/seller/promo/boosts", Map.of("productId", first, "days", 5), s).text("code")).isEqualTo("DAYS_INVALID");
		JsonNode o = post("/api/seller/promo/boosts", Map.of("productId", first, "days", 7, "reference", "TB777"), s).body();
		assertThat(o.path("boosts").get(0).path("status").asString()).isEqualTo("REQUESTED");
		assertThat(o.path("boosts").get(0).path("price").decimalValue()).isEqualByComparingTo("100");
		assertThat(post("/api/seller/promo/boosts", Map.of("productId", first, "days", 3), s).text("code")).isEqualTo("BOOST_WAITING");
		String other = seller();
		assertThat(post("/api/seller/promo/boosts", Map.of("productId", first, "days", 3), other).status()).isEqualTo(404);

		// newest first before the boost
		assertThat(get("/api/products?q=" + tag).body().path("content").get(0).path("id").asLong()).isEqualTo(second);

		JsonNode waiting = get("/api/admin/promo/boosts?show=waiting", admin).body().path("content");
		long boostId = -1;
		for (JsonNode b : waiting) {
			if (b.path("productId").asLong() == first) {
				boostId = b.path("id").asLong();
				assertThat(b.path("paymentReference").asString()).isEqualTo("TB777");
			}
		}
		assertThat(get("/api/admin/promo/counts", admin).body().path("boosts").asLong()).isGreaterThanOrEqualTo(1);
		JsonNode active = post("/api/admin/promo/boosts/" + boostId + "/confirm", Map.of(), admin).body();
		assertThat(active.path("status").asString()).isEqualTo("ACTIVE");
		assertThat(active.path("endsAt").isNull()).isFalse();

		// on top of search, in the home page list, and marked
		JsonNode list = get("/api/products?q=" + tag).body().path("content");
		assertThat(list.get(0).path("id").asLong()).isEqualTo(first);
		assertThat(list.get(0).path("boosted").asBoolean()).isTrue();
		assertThat(get("/api/products/boosted").body().toString()).contains("Boost first " + tag);
		assertThat(post("/api/admin/promo/boosts/" + boostId + "/confirm", Map.of(), admin).text("code")).isEqualTo("ALREADY_DECIDED");

		// rejected requests need a reason
		JsonNode again = post("/api/seller/promo/boosts", Map.of("productId", second, "days", 3), s).body();
		long secondBoost = again.path("boosts").get(0).path("id").asLong();
		assertThat(post("/api/admin/promo/boosts/" + secondBoost + "/reject", Map.of(), admin).text("code")).isEqualTo("NOTE_REQUIRED");
		assertThat(post("/api/admin/promo/boosts/" + secondBoost + "/reject", Map.of("note", "Payment not found"), admin).body()
				.path("status").asString()).isEqualTo("REJECTED");
	}

	@Test
	void freeShopsHaveALimit_proShopsDont() {
		put("/api/admin/features/free_plan_max_products", Map.of("value", "2"), admin);
		String s = seller();
		product(s, unique("Limit 1"));
		product(s, unique("Limit 2"));
		Res third = product(s, unique("Limit 3"));
		assertThat(third.status()).isEqualTo(409);
		assertThat(third.text("code")).isEqualTo("PLAN_LIMIT");
		JsonNode o = get("/api/seller/promo", s).body();
		assertThat(o.path("pro").asBoolean()).isFalse();
		assertThat(o.path("productLimit").asInt()).isEqualTo(2);
		assertThat(get("/api/seller/promo/stats", s).text("code")).isEqualTo("PRO_ONLY");

		assertThat(post("/api/seller/promo/plan", Map.of("months", 2), s).text("code")).isEqualTo("MONTHS_INVALID");
		JsonNode asked = post("/api/seller/promo/plan", Map.of("months", 3), s).body();
		long orderId = asked.path("planOrders").get(0).path("id").asLong();
		assertThat(asked.path("planOrders").get(0).path("price").decimalValue()).isEqualByComparingTo("1500");
		post("/api/seller/promo/plan/" + orderId + "/reference", Map.of("reference", "FT2026PRO"), s);
		JsonNode plan = post("/api/admin/promo/plans/" + orderId + "/confirm", Map.of(), admin).body();
		assertThat(plan.path("status").asString()).isEqualTo("PAID");
		assertThat(plan.path("pro").asBoolean()).isTrue();

		assertThat(product(s, unique("Limit 3")).status()).isEqualTo(200);
		JsonNode pro = get("/api/seller/promo", s).body();
		assertThat(pro.path("pro").asBoolean()).isTrue();
		assertThat(pro.path("productLimit").isNull()).isTrue();
		assertThat(get("/api/seller/shop", s).body().path("pro").asBoolean()).isTrue();
		assertThat(get("/api/seller/promo/stats", s).body().size()).isEqualTo(3);
	}

	@Test
	void bannersShowOnTheHomePage() throws Exception {
		JsonNode b = post("/api/admin/banners", Map.of("title", unique("Holiday sale"), "subtitle", "Up to 30% off", "linkUrl", "/shop"), admin).body();
		long id = b.path("id").asLong();
		assertThat(post("/api/admin/banners", Map.of("title", "Bad link", "linkUrl", "javascript:alert(1)"), admin).status()).isEqualTo(400);
		BufferedImage img = new BufferedImage(1200, 400, BufferedImage.TYPE_INT_RGB);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		assertThat(upload("/api/admin/banners/" + id + "/image", "banner.png", "image/png", out.toByteArray(), admin).body()
				.path("imageUrl").asString()).isNotBlank();
		assertThat(get("/api/banners").body().toString()).contains("\"id\":" + id);
		assertThat(post("/api/banners/" + id + "/click", Map.of()).body().path("linkUrl").asString()).isEqualTo("/shop");
		put("/api/admin/banners/" + id, Map.of("title", "Holiday sale", "active", false), admin);
		assertThat(get("/api/banners").body().toString()).doesNotContain("\"id\":" + id);
		assertThat(post("/api/admin/banners", Map.of("title", "x"), shopperToken()).status()).isEqualTo(403);
		delete("/api/admin/banners/" + id, admin);
	}
}
