package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Favourites with price-drop alerts, the area filter with "near me first", and share links with a preview. */
class FavouritesAreaShareIntegrationTest extends IntegrationTest {

	private JsonNode product(String admin, long categoryId, String name, String price, String area) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal(price));
		req.put("stock", 2);
		req.put("active", true);
		req.put("area", area);
		return post("/api/admin/products", req, admin).body().path("product");
	}

	@Test
	void favouritesTellYouWhenItGetsCheaper() {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Fav Cat")), admin).body();
		long cat = cats.get(cats.size() - 1).path("id").asLong();
		JsonNode sofa = product(admin, cat, unique("Sofa"), "9500", null);
		long id = sofa.path("id").asLong();
		String buyer = shopperToken();

		assertThat(put("/api/me/favourites/" + id, Map.of(), null).status()).isEqualTo(401);
		assertThat(put("/api/me/favourites/" + id, Map.of(), buyer).body().path("favourite").asBoolean()).isTrue();
		put("/api/me/favourites/" + id, Map.of(), buyer); // twice is fine
		assertThat(get("/api/me/favourites/ids", buyer).body().toString()).contains(String.valueOf(id));
		JsonNode list = get("/api/me/favourites", buyer).body();
		assertThat(list.get(0).path("priceWhenSaved").decimalValue()).isEqualByComparingTo("9500");
		assertThat(list.get(0).path("inStore").asBoolean()).isTrue();

		// the price goes down: the shopper is told
		Map<String, Object> edit = new LinkedHashMap<>();
		edit.put("name", sofa.path("name").asString());
		edit.put("categoryId", cat);
		edit.put("price", new BigDecimal("8000"));
		put("/api/admin/products/" + id, edit, admin);
		assertThat(get("/api/me/inbox", buyer).body().toString()).contains("Cheaper now", "Now 8000 birr (was 9500)");

		delete("/api/me/favourites/" + id, buyer);
		assertThat(get("/api/me/favourites/ids", buyer).body().toString()).doesNotContain(String.valueOf(id));
		assertThat(put("/api/me/favourites/999999999", Map.of(), buyer).status()).isEqualTo(404);
	}

	@Test
	void areaFilterAndNearMeFirst_andShareLinks() {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Area Cat")), admin).body();
		long cat = cats.get(cats.size() - 1).path("id").asLong();
		String tag = unique("a").substring(2);
		product(admin, cat, "Table Arada " + tag, "3000", "Arada");
		JsonNode merkato = product(admin, cat, "Table Merkato " + tag, "3000", "Merkato");

		JsonNode arada = get("/api/products?q=" + tag + "&area=arada").body();
		assertThat(arada.path("totalElements").asLong()).isEqualTo(1);
		assertThat(arada.path("content").get(0).path("name").asString()).contains("Arada");
		// newest first would put Merkato first anyway; near=Arada must win over that
		assertThat(get("/api/products?q=" + tag + "&near=Arada").body().path("content").get(0).path("name").asString()).contains("Arada");
		assertThat(get("/api/products?q=" + tag).body().path("content").get(0).path("name").asString()).contains("Merkato");

		Res share = get("/api/share/p/" + merkato.path("slug").asString());
		assertThat(share.status()).isEqualTo(200);
		assertThat(share.raw()).contains("og:title", "Table Merkato " + tag + " · 3000 birr", "Merkato", "/product/" + merkato.path("slug").asString());
		assertThat(get("/api/share/p/no-such-thing").raw()).contains("/shop");
	}
}
