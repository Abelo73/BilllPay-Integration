package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

/** Sign-up, sign-in, roles and session revocation over real HTTP. */
class AccountsAndRolesIntegrationTest extends IntegrationTest {

	private static final String PASSWORD = "Str0ng-pass";

	private String register(String email) {
		Res r = post("/api/auth/register", Map.of("fullName", "IT Customer", "email", email, "phone", "0911000000",
				"password", PASSWORD));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("token").asString();
	}

	private String createStaff(String role) {
		String email = unique("staff").toLowerCase() + "@it.test";
		Res r = post("/api/admin/users", Map.of("email", email, "fullName", "IT " + role, "role", role,
				"password", PASSWORD), adminToken());
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return email;
	}

	@Test
	void guestsCanBrowseButNotReachAccountsOrAdmin() {
		assertThat(get("/api/products/featured").status()).isEqualTo(200);
		assertThat(get("/api/me").status()).isEqualTo(401);
		assertThat(get("/api/admin/orders").status()).isEqualTo(401);
		assertThat(get("/api/admin/products").status()).isEqualTo(401);
	}

	@Test
	void onlySignedInCustomersCanCheckOut() {
		String admin = adminToken();
		long productId = createProduct(admin, new java.math.BigDecimal("100.00"), 5);
		String body = toJson(checkoutBody(productId, 1, "0911223344"));
		assertThat(postRaw("/api/checkout", body, Map.of()).status()).as("guest").isEqualTo(401);
		assertThat(post("/api/checkout", checkoutBody(productId, 1, "0911223344"), admin).status()).as("staff")
				.isEqualTo(403);
	}

	@Test
	void customerCanSignUpAndInButNeverReachAdmin() {
		String email = unique("buyer").toLowerCase() + "@it.test";
		String token = register(email);
		assertThat(get("/api/me", token).text("email")).isEqualTo(email);
		assertThat(get("/api/me/orders", token).status()).isEqualTo(200);

		assertThat(post("/api/auth/register", Map.of("fullName", "Dup", "email", email, "password", PASSWORD)).status())
				.isEqualTo(409);
		assertThat(login("/api/auth/login", email, PASSWORD)).isNotBlank();
		// customers can't use the staff sign-in or staff endpoints
		assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", PASSWORD)).status())
				.isIn(401, 403);
		assertThat(get("/api/admin/orders", token).status()).isEqualTo(403);
	}

	@Test
	void weakPasswordsAreRefused() {
		Res r = post("/api/auth/register", Map.of("fullName", "Weak", "email", unique("weak") + "@it.test",
				"password", "password"));
		assertThat(r.status()).isEqualTo(400);
		assertThat(r.text("code")).isEqualTo("WEAK_PASSWORD");
	}

	@Test
	void supportStaffCanLookButNotChange() {
		String support = login("/api/admin/auth/login", createStaff("SUPPORT"), PASSWORD);

		assertThat(get("/api/admin/orders", support).status()).isEqualTo(200);
		assertThat(get("/api/admin/products", support).status()).isEqualTo(200);
		assertThat(get("/api/admin/categories", support).status()).isEqualTo(200);

		assertThat(post("/api/admin/categories", Map.of("name", unique("nope")), support).status()).isEqualTo(403);
		assertThat(post("/api/admin/products", Map.of("name", "x"), support).status()).isEqualTo(403);
		assertThat(get("/api/admin/users", support).status()).isEqualTo(403);
		assertThat(get("/api/admin/login-events", support).status()).isEqualTo(403);
	}

	@Test
	void fiveWrongPasswordsLockTheAccount() {
		String email = unique("locky").toLowerCase() + "@it.test";
		register(email);
		for (int i = 0; i < 5; i++) {
			post("/api/auth/login", Map.of("email", email, "password", "Wrong-pass-1"));
		}
		Res locked = post("/api/auth/login", Map.of("email", email, "password", PASSWORD));
		assertThat(locked.status()).isEqualTo(423);
		assertThat(locked.text("code")).isEqualTo("ACCOUNT_LOCKED");
	}

	@Test
	void logOutEverywhereEndsOldSessions() {
		String email = unique("multi").toLowerCase() + "@it.test";
		String first = register(email);
		String second = login("/api/auth/login", email, PASSWORD);
		assertThat(get("/api/me", first).status()).isEqualTo(200);

		assertThat(post("/api/me/logout-all", Map.of(), second).status()).isIn(200, 204);

		assertThat(get("/api/me", first).status()).isEqualTo(401);
		assertThat(get("/api/me", second).status()).isEqualTo(401);
		assertThat(get("/api/me", login("/api/auth/login", email, PASSWORD)).status()).isEqualTo(200);
	}

	@Test
	void disabledStaffLoseAccessImmediately() {
		String email = createStaff("SUPPORT");
		String support = login("/api/admin/auth/login", email, PASSWORD);
		String admin = adminToken();
		String id = get("/api/admin/users?q=" + email, admin).body().path("content").get(0).path("id").asString();

		assertThat(patch("/api/admin/users/" + id, Map.of("enabled", false), admin).status()).isEqualTo(200);

		assertThat(get("/api/admin/orders", support).status()).isEqualTo(401);
		assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", PASSWORD)).status()).isEqualTo(403);
	}

	@Test
	void unknownRoutesAre404NotForbidden() {
		// Regression: /error used to be blocked, so a missing route showed up as 403
		assertThat(get("/api/admin/no-such-thing", adminToken()).status()).isEqualTo(404);
		assertThat(get("/api/products/no-such-product").status()).isEqualTo(404);
	}
}
