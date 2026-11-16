package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/** The public profile: private by default, first name and picture only, and gone again when switched off. */
class PublicProfileIntegrationTest extends IntegrationTest {

	@Test
	void privateUntilSwitchedOnAndNeverShowsContactDetails() {
		String email = unique("profile") + "@it.test";
		Res reg = post("/api/auth/register", Map.of("fullName", "Hana Tesfaye Bekele", "email", email,
				"password", "Seller-pass-2026", "phone", "0911223344"));
		assertThat(reg.status()).as(reg.raw()).isEqualTo(200);
		String token = reg.body().path("token").asString();
		String id = get("/api/me", token).body().path("id").asString();

		// off by default: others get "not found", the same as for a profile that does not exist
		assertThat(get("/api/people/" + id).status()).isEqualTo(404);

		Res on = put("/api/me/public-profile", Map.of("profilePublic", true, "bio", "Coffee and fabrics", "area", "Arada"), token);
		assertThat(on.status()).as(on.raw()).isEqualTo(200);

		Res shown = get("/api/people/" + id);
		assertThat(shown.status()).isEqualTo(200);
		assertThat(shown.body().path("firstName").asString()).isEqualTo("Hana");
		assertThat(shown.body().path("bio").asString()).isEqualTo("Coffee and fabrics");
		assertThat(shown.body().path("area").asString()).isEqualTo("Arada");
		// nothing private leaks: no surname, email or phone
		String raw = shown.body().toString();
		assertThat(raw).doesNotContain("Tesfaye").doesNotContain(email).doesNotContain("0911223344");

		// switched off again: gone at once
		put("/api/me/public-profile", Map.of("profilePublic", false), token);
		assertThat(get("/api/people/" + id).status()).isEqualTo(404);

		assertThat(get("/api/people/" + UUID.randomUUID()).status()).isEqualTo(404);
	}
}
