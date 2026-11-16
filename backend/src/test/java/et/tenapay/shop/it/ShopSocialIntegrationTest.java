package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

/** Shop social handles: a name is saved, a web address is refused, and blank clears it. */
class ShopSocialIntegrationTest extends IntegrationTest {

	@Test
	void handlesOnlyNoAddresses() {
		Res reg = post("/api/auth/register", Map.of("fullName", "Social Owner", "email", unique("soc") + "@it.test",
				"password", "Seller-pass-2026"));
		String token = reg.body().path("token").asString();
		post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", unique("Social Shop"), "phone", "0912345678", "area", "Arada"), token);

		Res ok = put("/api/seller/shop/social", Map.of("instagram", "@marta_boutique", "facebook", "Marta Boutique Sodo",
				"telegram", "martaboutique"), token);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		assertThat(ok.body().path("instagram").asString()).isEqualTo("marta_boutique");
		assertThat(ok.body().path("telegram").asString()).isEqualTo("martaboutique");

		// a web address is refused, so the link always goes where we say
		Res bad = put("/api/seller/shop/social", Map.of("instagram", "https://instagram.com/marta"), token);
		assertThat(bad.status()).isEqualTo(400);
		assertThat(bad.body().path("code").asString()).isEqualTo("HANDLE_INVALID");

		// blank clears one
		Res cleared = put("/api/seller/shop/social", Map.of("instagram", "", "facebook", "Marta Boutique Sodo", "telegram", "martaboutique"), token);
		assertThat(cleared.body().path("instagram").isNull()).isTrue();
	}
}
