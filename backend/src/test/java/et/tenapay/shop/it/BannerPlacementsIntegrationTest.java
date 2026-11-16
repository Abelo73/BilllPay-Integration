package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import tools.jackson.databind.JsonNode;

/**
 * One picture and one switch per place: the hero's desktop panel, its phone panel, and the offers strip. A place
 * without its own picture uses the single picture, so older banners keep working.
 */
class BannerPlacementsIntegrationTest extends IntegrationTest {

	@Autowired
	private org.springframework.jdbc.core.JdbcTemplate jdbc;

	private byte[] png(int w, int h) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	private JsonNode banner(JsonNode list, long id) {
		for (JsonNode b : list) {
			if (b.path("id").asLong() == id) {
				return b;
			}
		}
		throw new AssertionError("banner " + id + " not listed");
	}

	@Test
	void eachPlaceHasItsOwnPictureAndSwitch() throws Exception {
		String admin = adminToken();
		long id = post("/api/admin/banners", Map.of("title", unique("Places"), "active", true), admin).body().path("id").asLong();

		// no picture yet: every place is empty
		JsonNode none = banner(get("/api/admin/banners", admin).body(), id);
		assertThat(none.path("heroUrl").isNull()).isTrue();
		assertThat(none.path("stripUrl").isNull()).isTrue();

		// the desktop hero picture: the phone panel falls back to it, the strip stays empty
		assertThat(upload("/api/admin/banners/" + id + "/image/hero", "hero.png", "image/png", png(1600, 1200), admin).status())
				.isEqualTo(200);
		JsonNode hero = banner(get("/api/admin/banners", admin).body(), id);
		assertThat(hero.path("heroUrl").asString()).isNotBlank();
		// the picture must be reachable on the public media route, or the home page shows a broken image
		String heroPath = hero.path("heroUrl").asString();
		assertThat(get(heroPath).status()).as("hero picture at " + heroPath).isEqualTo(200);
		assertThat(hero.path("phoneUrl").asString()).isEqualTo(hero.path("heroUrl").asString());
		assertThat(hero.path("stripUrl").isNull()).isTrue();

		// its own phone and strip pictures
		assertThat(upload("/api/admin/banners/" + id + "/image/phone", "phone.png", "image/png", png(1600, 1000), admin).status())
				.isEqualTo(200);
		assertThat(upload("/api/admin/banners/" + id + "/image/strip", "strip.png", "image/png", png(1600, 533), admin).status())
				.isEqualTo(200);
		JsonNode all = banner(get("/api/admin/banners", admin).body(), id);
		assertThat(all.path("phoneUrl").asString()).isNotEqualTo(all.path("heroUrl").asString());
		assertThat(all.path("stripUrl").asString()).isNotBlank().isNotEqualTo(all.path("heroUrl").asString());

		// an unknown place is refused
		assertThat(upload("/api/admin/banners/" + id + "/image/sidebar", "x.png", "image/png", png(10, 10), admin).status())
				.isEqualTo(400);

		// the switches: off in the hero, still in the strip
		put("/api/admin/banners/" + id, Map.of("title", "Places", "showInHero", false, "showInStrip", true), admin);
		JsonNode switched = banner(get("/api/admin/banners", admin).body(), id);
		assertThat(switched.path("showInHero").asBoolean()).isFalse();
		assertThat(switched.path("showInStrip").asBoolean()).isTrue();
		assertThat(jdbc.queryForObject("select count(*) from banner_ads where id = ? and show_in_hero = false", Integer.class, id))
				.isEqualTo(1);

		delete("/api/admin/banners/" + id, admin);
	}
}
