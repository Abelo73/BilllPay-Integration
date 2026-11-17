package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Synonyms: a word finds listings that use its synonym, and a word with no synonym still needs its own match. */
class SearchSynonymsIntegrationTest extends IntegrationTest {

	private JsonNode product(String admin, long categoryId, String name) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("1500"));
		req.put("stock", 3);
		req.put("active", true);
		return post("/api/admin/products", req, admin).body().path("product");
	}

	@Test
	void synonymsFindTheListingAndUnrelatedWordsStillDoNot() {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Syn Cat")), admin).body();
		long cat = cats.get(cats.size() - 1).path("id").asLong();
		String tag = unique("y").substring(2);
		// "mobile" is in the name; "phone" is not anywhere in it
		product(admin, cat, "Mobile Charger " + tag);

		// "phone" finds it through the synonym list
		assertThat(get("/api/products?q=phone%20" + tag).body().path("content").size()).isGreaterThan(0);
		// a word with no synonym and no match still finds nothing
		assertThat(get("/api/products?q=sofa%20" + tag).body().path("content").size()).isZero();
	}
}
