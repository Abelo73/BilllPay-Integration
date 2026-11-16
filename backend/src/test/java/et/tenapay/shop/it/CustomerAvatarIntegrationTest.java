package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

/** A customer's profile picture: upload, show on /api/me, reachable on the public media route, and removable. */
class CustomerAvatarIntegrationTest extends IntegrationTest {

	private byte[] png(int w, int h) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	@Test
	void uploadShowRemove() throws Exception {
		Res reg = post("/api/auth/register", Map.of("fullName", "Avatar Person", "email", unique("avatar") + "@it.test",
				"password", "Seller-pass-2026"));
		assertThat(reg.status()).as(reg.raw()).isEqualTo(200);
		String token = reg.body().path("token").asString();

		assertThat(get("/api/me", token).body().path("avatarUrl").isNull()).isTrue();

		Res up = upload("/api/me/avatar", "me.png", "image/png", png(600, 600), token);
		assertThat(up.status()).as(up.raw()).isEqualTo(200);
		String url = up.body().path("avatarUrl").asString();
		assertThat(url).startsWith("/api/media/avatars/");
		// the picture must load on the public media route, or the account page shows a broken image
		assertThat(get(url).status()).as("avatar at " + url).isEqualTo(200);
		assertThat(get("/api/me", token).body().path("avatarUrl").asString()).isEqualTo(url);

		// a second upload replaces the first
		String next = upload("/api/me/avatar", "me2.png", "image/png", png(500, 500), token).body().path("avatarUrl").asString();
		assertThat(next).isNotEqualTo(url);

		assertThat(delete("/api/me/avatar", token).body().path("avatarUrl").isNull()).isTrue();
	}
}
