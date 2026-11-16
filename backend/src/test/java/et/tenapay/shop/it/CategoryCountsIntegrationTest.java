package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** /api/categories: each category's count of listings the store shows; a main category includes its sub-categories. */
class CategoryCountsIntegrationTest extends IntegrationTest {

	private long categoryId(JsonNode rows, String name) {
		for (JsonNode r : rows) {
			if (r.path("name").asString().equals(name)) {
				return r.path("id").asLong();
			}
		}
		throw new AssertionError("no category " + name);
	}

	private long listing(String admin, long categoryId, boolean active) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Count item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("100.00"));
		req.put("stock", 3);
		req.put("active", active);
		Res r = post("/api/admin/products", req, admin);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("product").path("id").asLong();
	}

	private long countOf(long id) {
		for (JsonNode r : get("/api/categories").body()) {
			if (r.path("id").asLong() == id) {
				return r.path("listingCount").asLong();
			}
		}
		throw new AssertionError("category " + id + " not in /api/categories");
	}

	@Test
	void mainCountsItsSubCategories_andHiddenListingsDontCount() {
		String admin = adminToken();
		String mainName = unique("Count Main");
		String subName = unique("Count Sub");
		long main = categoryId(post("/api/admin/categories", Map.of("name", mainName), admin).body(), mainName);
		long sub = categoryId(post("/api/admin/categories", Map.of("name", subName, "parentId", main), admin).body(), subName);
		assertThat(countOf(main)).isZero();

		listing(admin, sub, true);
		listing(admin, sub, true);
		listing(admin, main, true);
		listing(admin, sub, false); // switched off: the store doesn't show it

		assertThat(countOf(sub)).isEqualTo(2);
		assertThat(countOf(main)).isEqualTo(3);
	}
}
