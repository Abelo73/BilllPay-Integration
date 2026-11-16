package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Store search: every word must match, descriptions count, and a small typo still finds the product. */
class StoreSearchIntegrationTest extends IntegrationTest {

	private JsonNode product(String admin, long categoryId, String name, String description) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("1500"));
		req.put("stock", 3);
		req.put("active", true);
		req.put("description", description);
		return post("/api/admin/products", req, admin).body().path("product");
	}

	@Test
	void everyWordMatchesAndTyposStillFind() {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Search Cat")), admin).body();
		long cat = cats.get(cats.size() - 1).path("id").asLong();
		String tag = unique("s").substring(2);
		// the word "gizmo" appears only in the description, the word "blue" only in the name
		product(admin, cat, "Blue Phone Case " + tag, "Soft silicone cover, gizmo edition");

		// both words are needed: a word that matches nothing removes the product
		assertThat(get("/api/products?q=blue%20" + tag).body().path("content").size()).isGreaterThan(0);
		assertThat(get("/api/products?q=blue%20zzzqqq%20" + tag).body().path("content").size()).isZero();

		// description words count
		assertThat(get("/api/products?q=gizmo%20" + tag).body().path("content").size()).isGreaterThan(0);

		// a typo still finds it: "fone" for "phone" (the name contains "Phone")
		assertThat(get("/api/products?q=fone%20" + tag).body().path("content").size()).isGreaterThan(0);
	}
}
