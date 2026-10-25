package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Subcategories and their detail fields (brand → model lists, RAM, storage, ...): listing, showing, filtering, admin. */
class SpecsIntegrationTest extends IntegrationTest {

	private long categoryId(String slug) {
		for (JsonNode c : get("/api/categories").body()) {
			if (c.path("slug").asString().equals(slug)) {
				return c.path("id").asLong();
			}
		}
		throw new AssertionError("no category " + slug);
	}

	private Map<String, Object> phone(String name, Map<String, Object> specs) {
		Map<String, Object> p = new LinkedHashMap<>();
		p.put("name", name);
		p.put("categoryId", categoryId("mobile-phones"));
		p.put("price", new BigDecimal("25000.00"));
		p.put("stock", 1);
		p.put("active", true);
		p.put("specs", specs);
		return p;
	}

	@Test
	void phonesHaveBrandModelAndStorage_andShoppersFilterByThem() {
		String admin = adminToken();
		JsonNode cats = get("/api/categories").body();
		long electronics = categoryId("electronics");
		assertThat(cats.toString()).contains("mobile-phones", "laptops", "beds", "tables");
		for (JsonNode c : cats) {
			if (c.path("slug").asString().equals("laptops")) {
				assertThat(c.path("parentId").asLong()).isEqualTo(electronics);
			}
		}

		JsonNode fields = get("/api/categories/mobile-phones/fields").body().path("fields");
		assertThat(fields.get(0).path("key").asString()).isEqualTo("brand");
		assertThat(fields.toString()).contains("\"model\"", "Galaxy A15", "iPhone 13 Pro", "\"storage\"", "\"warranty\"");

		// required storage missing; storage not from the list
		Res missing = post("/api/admin/products", phone(unique("Phone"), Map.of("brand", "Samsung", "model", "Galaxy A15")), admin);
		assertThat(missing.status()).isEqualTo(400);
		assertThat(missing.text("code")).isEqualTo("SPECS_INVALID");
		assertThat(missing.body().path("errors").has("specs.storage")).isTrue();
		assertThat(post("/api/admin/products", phone(unique("Phone"), Map.of("brand", "Samsung", "storage", "999 GB")), admin).status())
				.isEqualTo(400);

		String tag = unique("x").substring(2);
		Map<String, Object> samsungSpecs = new LinkedHashMap<>();
		samsungSpecs.put("brand", "samsung"); // matched case-insensitively
		samsungSpecs.put("model", "Galaxy A15");
		samsungSpecs.put("storage", "128 GB");
		samsungSpecs.put("ram", "6 GB");
		samsungSpecs.put("network", "5G");
		samsungSpecs.put("features", List.of("NFC", "Fast charging"));
		samsungSpecs.put("battery", "5000");
		samsungSpecs.put("unknown", "dropped");
		JsonNode samsung = post("/api/admin/products", phone("Phone " + tag + " S", samsungSpecs), admin).body();
		assertThat(samsung.path("specs").path("brand").asString()).isEqualTo("Samsung");
		assertThat(samsung.path("specs").path("battery").asLong()).isEqualTo(5000);
		assertThat(samsung.path("specs").has("unknown")).isFalse();
		// an iPhone with a model typed by the seller ("Other" allowed)
		post("/api/admin/products", phone("Phone " + tag + " A", Map.of("brand", "Apple", "model", "iPhone 18 Concept", "storage", "256 GB")), admin);

		// product page details table
		JsonNode page = get("/api/products/" + samsung.path("product").path("slug").asString()).body();
		assertThat(page.path("specs").toString()).contains("Brand", "Samsung", "Galaxy A15", "5000 mAh", "NFC, Fast charging");

		// filters: by brand on the main category, by storage on the subcategory; search finds the model
		// brand is a phone field: on the main category it isn't a filter, so both phones show
		assertThat(get("/api/products?category=electronics&q=" + tag + "&spec.brand=Samsung").body().path("totalElements").asLong()).isEqualTo(2);
		assertThat(get("/api/products?category=mobile-phones&q=" + tag + "&spec.brand=Samsung").body().path("totalElements").asLong()).isEqualTo(1);
		assertThat(get("/api/products?category=electronics&q=" + tag).body().path("totalElements").asLong()).isEqualTo(2);
		assertThat(get("/api/products?category=mobile-phones&q=" + tag + "&spec.storage=256%20GB").body().path("content").get(0).path("name").asString())
				.endsWith(" A");
		assertThat(get("/api/products?category=mobile-phones&q=" + tag + "&spec.features=NFC").body().path("totalElements").asLong()).isEqualTo(1);
		assertThat(get("/api/products?q=iPhone%2018%20Concept").body().path("totalElements").asLong()).isGreaterThanOrEqualTo(1);
		JsonNode facets = get("/api/categories/mobile-phones/fields?facets=true").body().path("facets");
		assertThat(facets.toString()).contains("\"brand\"", "Samsung", "Apple");

		// editing keeps details valid
		long id = samsung.path("product").path("id").asLong();
		Map<String, Object> edit = phone("Phone " + tag + " S", Map.of("brand", "Samsung", "model", "Galaxy A15", "storage", "64 GB"));
		assertThat(put("/api/admin/products/" + id, edit, admin).body().path("specs").path("storage").asString()).isEqualTo("64 GB");
	}

	@Test
	void adminsManageFieldsAndSubcategories() {
		String admin = adminToken();
		long home = categoryId("home-living");
		JsonNode created = post("/api/admin/categories", Map.of("name", unique("Carpets"), "parentId", home), admin).body();
		long carpets = -1;
		for (JsonNode c : created) {
			if (c.path("name").asString().startsWith("Carpets")) {
				carpets = c.path("id").asLong();
				assertThat(c.path("parentId").asLong()).isEqualTo(home);
			}
		}
		// subcategories go one level deep
		long finalCarpets = carpets;
		assertThat(post("/api/admin/categories", Map.of("name", unique("Rugs"), "parentId", finalCarpets), admin).text("code")).isEqualTo("PARENT_INVALID");

		String base = "/api/admin/categories/" + carpets + "/fields";
		assertThat(post(base, Map.of("label", "Size", "type", "SELECT"), admin).text("code")).isEqualTo("OPTIONS_REQUIRED");
		JsonNode list = post(base, Map.of("label", "Size", "type", "SELECT", "options", "2 × 3 m\n3 × 4 m\n3 × 4 m\n", "required", true,
				"filterable", true), admin).body();
		assertThat(list.get(0).path("key").asString()).isEqualTo("size");
		assertThat(list.get(0).path("options").size()).isEqualTo(2); // duplicate dropped
		list = post(base, Map.of("label", "Material", "type", "SELECT", "options", List.of("Wool", "Synthetic"), "allowOther", true), admin).body();
		assertThat(post(base, Map.of("label", "Size", "type", "TEXT"), admin).text("code")).isEqualTo("KEY_TAKEN");
		// a field of the parent is inherited by the subcategory
		assertThat(get("/api/admin/categories/" + carpets + "/fields", admin).body().size()).isEqualTo(2);

		long sizeId = list.get(0).path("id").asLong();
		long materialId = list.get(1).path("id").asLong();
		list = put(base + "/order", Map.of("ids", List.of(materialId, sizeId)), admin).body();
		assertThat(list.get(0).path("key").asString()).isEqualTo("material");
		list = put(base + "/" + sizeId, Map.of("options", List.of("2 × 3 m", "3 × 4 m", "4 × 5 m"), "required", false), admin).body();
		assertThat(list.toString()).contains("4 × 5 m");

		Map<String, Object> carpet = new LinkedHashMap<>();
		carpet.put("name", unique("Wool carpet"));
		carpet.put("categoryId", carpets);
		carpet.put("price", new BigDecimal("4000"));
		carpet.put("active", true);
		carpet.put("specs", Map.of("size", "4 × 5 m", "material", "Silk"));
		JsonNode p = post("/api/admin/products", carpet, admin).body();
		assertThat(p.path("specs").path("material").asString()).isEqualTo("Silk");

		// removed fields stop showing
		delete(base + "/" + materialId, admin);
		JsonNode shown = get("/api/products/" + p.path("product").path("slug").asString()).body().path("specs");
		assertThat(shown.toString()).contains("4 × 5 m").doesNotContain("Silk");

		// seller can't reach admin field endpoints
		assertThat(post(base, Map.of("label", "X", "type", "TEXT"), shopperToken()).status()).isEqualTo(403);
	}
}
