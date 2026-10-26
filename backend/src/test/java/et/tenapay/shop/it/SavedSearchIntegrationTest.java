package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** M9: a saved search sends new matching listings to the inbox (and SMS once a day); price filters on the shop page. */
class SavedSearchIntegrationTest extends IntegrationTest {

	private long categoryId(String slug) {
		for (JsonNode c : get("/api/categories").body()) {
			if (c.path("slug").asString().equals(slug)) {
				return c.path("id").asLong();
			}
		}
		throw new AssertionError(slug);
	}

	private long phone(String admin, String name, String brand, String price) {
		Map<String, Object> p = new LinkedHashMap<>();
		p.put("name", name);
		p.put("categoryId", categoryId("mobile-phones"));
		p.put("price", new BigDecimal(price));
		p.put("stock", 1);
		p.put("active", true);
		p.put("specs", Map.of("brand", brand, "model", brand.equals("Apple") ? "iPhone 13" : "Galaxy A15", "storage", "128 GB"));
		Res r = post("/api/admin/products", p, admin);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("product").path("id").asLong();
	}

	@Test
	void newMatchingListingsAreSentToTheShopper() {
		String admin = adminToken();
		String buyer = post("/api/auth/register", Map.of("fullName", "Search Buyer", "email", unique("ss") + "@it.test",
				"phone", "0913777888", "password", "Buyer-pass-2026")).body().path("token").asString();
		String tag = unique("s").substring(2);

		assertThat(post("/api/me/searches", Map.of("name", "nothing"), buyer).text("code")).isEqualTo("SEARCH_EMPTY");
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("q", tag);
		req.put("category", "mobile-phones");
		req.put("specs", Map.of("brand", "Samsung"));
		req.put("maxPrice", 20000);
		req.put("alertSms", true);
		JsonNode saved = post("/api/me/searches", req, buyer).body();
		long id = saved.path("id").asLong();
		assertThat(saved.path("name").asString()).contains("Samsung");
		assertThat(saved.path("newCount").asLong()).isZero();
		assertThat(saved.path("link").asString()).contains("category=mobile-phones", "spec.brand=Samsung", "maxPrice=20000");

		phone(admin, "Galaxy A15 " + tag, "Samsung", "15000");
		phone(admin, "Galaxy S24 " + tag, "Samsung", "60000"); // too expensive
		phone(admin, "iPhone 13 " + tag, "Apple", "15000"); // another brand

		// price filters on the shop page
		assertThat(get("/api/products?q=" + tag + "&maxPrice=20000").body().path("totalElements").asLong()).isEqualTo(2);
		assertThat(get("/api/products?q=" + tag + "&minPrice=20000").body().path("totalElements").asLong()).isEqualTo(1);

		assertThat(get("/api/me/searches", buyer).body().get(0).path("newCount").asLong()).isEqualTo(1);
		assertThat(post("/api/admin/saved-searches/run-alerts", Map.of(), admin).body().path("alerted").asInt()).isGreaterThanOrEqualTo(1);
		JsonNode inbox = get("/api/me/inbox", buyer).body();
		assertThat(inbox.toString()).contains("ALERT", "Galaxy A15 " + tag, "spec.brand=Samsung").doesNotContain("iPhone 13 " + tag);
		await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
				assertThat(get("/api/admin/sms?q=913777888", admin).raw()).contains("New for"));

		// already told: no second alert for the same listing; a new one comes later, inbox only (SMS once a day)
		post("/api/admin/saved-searches/run-alerts", Map.of(), admin);
		assertThat(get("/api/me/inbox", buyer).body().toString().split("Galaxy A15 " + tag, -1).length - 1).isEqualTo(1);
		phone(admin, "Galaxy A25 " + tag, "Samsung", "18000");
		post("/api/admin/saved-searches/run-alerts", Map.of(), admin);
		assertThat(get("/api/me/inbox", buyer).body().toString()).contains("Galaxy A25 " + tag);
		assertThat(get("/api/admin/sms?q=913777888", admin).raw().split("New for", -1).length - 1).isEqualTo(1);

		// settings, other people's searches, delete
		assertThat(patch("/api/me/searches/" + id, Map.of("alertSms", false, "name", "Cheap Samsung"), buyer).body().path("name").asString())
				.isEqualTo("Cheap Samsung");
		assertThat(patch("/api/me/searches/" + id, Map.of("alertSms", false), shopperToken()).status()).isEqualTo(404);
		delete("/api/me/searches/" + id, buyer);
		assertThat(get("/api/me/searches", buyer).body().size()).isZero();
	}
}
