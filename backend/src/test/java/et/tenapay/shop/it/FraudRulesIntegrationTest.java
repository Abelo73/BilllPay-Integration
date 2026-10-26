package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** M23 fraud rules: scam words, a suspiciously low price from a new shop, and several reports hold a listing. */
class FraudRulesIntegrationTest extends IntegrationTest {

	private String customer(String name) {
		return post("/api/auth/register", Map.of("fullName", name, "email", unique("fr") + "@it.test", "phone", "0912345678",
				"password", "Fraud-pass-2026")).body().path("token").asString();
	}

	private String seller(String admin) {
		String token = customer("New Seller");
		long shopId = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", unique("Fresh Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		return token;
	}

	private JsonNode list(String token, long categoryId, String name, String price, String description) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal(price));
		req.put("stock", 1);
		req.put("active", true);
		req.put("description", description);
		return post("/api/seller/products", req, token).body();
	}

	@Test
	void suspiciousListingsAreHeldForACheck() {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Fraud Cat")), admin).body();
		long cat = cats.get(cats.size() - 1).path("id").asLong();
		for (int i = 0; i < 5; i++) {
			createProductIn(admin, cat, "10000.00");
		}
		String s = seller(admin);

		// asks for money first
		JsonNode scam = list(s, cat, unique("Laptop"), "9000", "Great laptop. Send money first by telebirr and I deliver.");
		assertThat(scam.path("product").path("blockedReason").asString()).startsWith("Held for a check");
		assertThat(get("/api/products/" + scam.path("product").path("slug").asString()).status()).isEqualTo(404);
		assertThat(get("/api/me/inbox", s).body().toString()).contains("held for a check");

		// far below the usual price from a new, unverified shop; a normal price passes
		assertThat(list(s, cat, unique("Cheap"), "1500", "Like new").path("product").path("blockedReason").asString()).contains("much lower");
		JsonNode fair = list(s, cat, unique("Fair"), "8000", "Like new");
		assertThat(fair.path("product").path("blockedReason").isNull()).isTrue();

		// several shoppers report the fair one: held until staff look; staff put it back
		long fairId = fair.path("product").path("id").asLong();
		for (int i = 0; i < 3; i++) {
			assertThat(post("/api/products/" + fairId + "/report", Map.of("reason", "SCAM"), customer("Reporter " + i)).status()).isEqualTo(200);
		}
		assertThat(get("/api/admin/products/" + fairId, admin).body().path("product").path("blockedReason").asString()).contains("3 shoppers reported");
		assertThat(get("/api/admin/products?status=blocked&q=" + fair.path("product").path("name").asString(), admin).body()
				.path("totalElements").asLong()).isEqualTo(1);
	}

	@Test
	void newShopsCantFloodListings() {
		String admin = adminToken();
		put("/api/admin/features/new_shop_hourly_listings", Map.of("value", "2"), admin);
		try {
			JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Burst Cat")), admin).body();
			long cat = cats.get(cats.size() - 1).path("id").asLong();
			String s = seller(admin);
			list(s, cat, unique("One"), "100", null);
			list(s, cat, unique("Two"), "100", null);
			Res third = post("/api/seller/products", Map.of("name", unique("Three"), "categoryId", cat, "price", 100, "active", true), s);
			assertThat(third.status()).isEqualTo(429);
			assertThat(third.text("code")).isEqualTo("SLOW_DOWN");
		} finally {
			put("/api/admin/features/new_shop_hourly_listings", Map.of("value", "15"), admin);
		}
	}

	private void createProductIn(String admin, long cat, String price) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Usual"));
		req.put("categoryId", cat);
		req.put("price", new BigDecimal(price));
		req.put("stock", 1);
		req.put("active", true);
		assertThat(post("/api/admin/products", req, admin).status()).isEqualTo(200);
	}
}
