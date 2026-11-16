package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/**
 * Identity check, stage 1: a seller's ID number is stored only as a keyed hash, and one ID number can belong to
 * one shop at a time. A second shop with the same ID is refused, and so is a submit that finds it taken.
 */
class IdentityCheckIntegrationTest extends IntegrationTest {

	@Autowired
	private JdbcTemplate jdbc;

	private String customer(String name) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("idc") + "@it.test",
				"password", "Seller-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("token").asString();
	}

	private JsonNode shop(String token, String name) {
		Res r = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", name, "phone", "0912345678", "area", "Arada"), token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body();
	}

	@Test
	void sameIdNumberCannotOpenASecondShopWhileTheFirstIsPending() {
		String first = customer("First Seller");
		long firstShop = shop(first, "First Shop " + unique("a")).path("id").asLong();
		Res saved = put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "", "idNumber", "ET 1234-5678"), first);
		assertThat(saved.status()).as(saved.raw()).isEqualTo(200);

		// the first request is with staff: the ID number now counts as taken
		jdbc.update("update verifications set status = 'SUBMITTED' where shop_id = ?", firstShop);

		String second = customer("Second Seller");
		shop(second, "Second Shop " + unique("b"));
		// the same number, typed differently, is still the same ID
		Res dup = put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "", "idNumber", "et12345678"), second);
		assertThat(dup.status()).as(dup.raw()).isEqualTo(409);
		assertThat(dup.body().path("code").asString()).isEqualTo("DUPLICATE_ID");

		// a different ID is fine
		Res other = put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "", "idNumber", "ET 9999 0000"), second);
		assertThat(other.status()).as(other.raw()).isEqualTo(200);

		// the first seller saving the same number again is not blocked by their own request
		// (their request is back as a draft; staff are not reviewing it any more)
		jdbc.update("update verifications set status = 'DRAFT' where shop_id = ?", firstShop);
		Res again = put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "updated", "idNumber", "ET12345678"), first);
		assertThat(again.status()).as(again.raw()).isEqualTo(200);
	}

	@Test
	void theIdNumberIsNeverStoredInPlainText() {
		String seller = customer("Plain Text Check");
		long shopId = shop(seller, "Privacy Shop " + unique("p")).path("id").asLong();
		put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "", "idNumber", "ET 5555 6666"), seller);
		String stored = jdbc.queryForObject("select id_number_hash from verifications where shop_id = ?", String.class, shopId);
		assertThat(stored).isNotNull().hasSize(64).doesNotContain("5555").doesNotContain("6666");
	}

	@Test
	void anInvalidIdNumberIsRefused() {
		String seller = customer("Bad Number");
		shop(seller, "Bad Shop " + unique("x"));
		Res bad = put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "", "idNumber", "!!"), seller);
		assertThat(bad.status()).as(bad.raw()).isEqualTo(400);
		assertThat(bad.body().path("code").asString()).isEqualTo("ID_NUMBER_INVALID");
	}
}
