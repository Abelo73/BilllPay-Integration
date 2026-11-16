package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The shop photo gallery: up to six photos, reachable on the public media route, and removable by the owner only. */
class ShopGalleryIntegrationTest extends IntegrationTest {

	private byte[] png() throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	@Test
	void sixPhotosAtMostAndOwnerOnly() throws Exception {
		Res reg = post("/api/auth/register", Map.of("fullName", "Gallery Owner", "email", unique("gal") + "@it.test",
				"password", "Seller-pass-2026"));
		String token = reg.body().path("token").asString();
		Res shop = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", unique("Gallery Shop"), "phone", "0912345678",
				"area", "Arada"), token);
		assertThat(shop.status()).as(shop.raw()).isEqualTo(200);

		JsonNode last = null;
		for (int i = 0; i < 6; i++) {
			Res up = upload("/api/seller/shop/photos", "shop" + i + ".png", "image/png", png(), token);
			assertThat(up.status()).as(up.raw()).isEqualTo(200);
			last = up.body();
		}
		assertThat(last.size()).isEqualTo(6);
		assertThat(last.get(0).path("url").asString()).startsWith("/api/media/shops/");

		// the seventh is refused
		Res seventh = upload("/api/seller/shop/photos", "shop7.png", "image/png", png(), token);
		assertThat(seventh.status()).isEqualTo(409);
		assertThat(seventh.body().path("code").asString()).isEqualTo("GALLERY_FULL");

		// every photo loads on the public media route
		assertThat(get(last.get(0).path("url").asString()).status()).isEqualTo(200);

		// someone else cannot remove them
		Res other = post("/api/auth/register", Map.of("fullName", "Other Person", "email", unique("gal2") + "@it.test",
				"password", "Seller-pass-2026"));
		long id = last.get(0).path("id").asLong();
		assertThat(delete("/api/seller/shop/photos/" + id, other.body().path("token").asString()).status()).isEqualTo(404);

		// the owner removes one
		JsonNode after = delete("/api/seller/shop/photos/" + id, token).body();
		assertThat(after.size()).isEqualTo(5);
	}
}
