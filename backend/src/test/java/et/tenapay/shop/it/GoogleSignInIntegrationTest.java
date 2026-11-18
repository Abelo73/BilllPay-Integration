package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import et.tenapay.shop.user.AuthService;
import et.tenapay.shop.user.AuthService.ClientInfo;

/**
 * "Continue with Google". The tests have no Google client id, so the browser token is not checked here; the account
 * rules are tested by calling the sign-in directly with an identity Google would have verified.
 */
class GoogleSignInIntegrationTest extends IntegrationTest {

	@Autowired
	AuthService auth;

	@Test
	void theButtonStaysOffWithoutAClientIdAndTheEndpointRefuses() {
		assertThat(get("/api/auth/google/config").body().path("enabled").asBoolean()).isFalse();
		Res r = post("/api/auth/google", Map.of("credential", "not-a-real-token"), null);
		assertThat(r.status()).isEqualTo(404);
		assertThat(r.body().path("code").asString()).isEqualTo("GOOGLE_OFF");
	}

	@Test
	void aNewGoogleIdentityGetsACustomerAccountWithoutAPassword() {
		String email = unique("gnew") + "@it.test";
		AuthService.Session s = auth.signInWithGoogle("google-sub-" + unique("a"), email, "Gina Google", (ClientInfo) null);
		assertThat(s.token()).isNotBlank();
		// it has no password, so a password sign-in is refused
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "Any-pass-2026"), null).status()).isEqualTo(401);
	}

	@Test
	void anExistingAccountIsLinkedAndAnotherGoogleAccountIsRefused() {
		String email = unique("glink") + "@it.test";
		assertThat(post("/api/auth/register", Map.of("fullName", "Linked Person", "email", email, "password", "Linked-pass-2026"), null).status())
				.isEqualTo(200);
		String sub = "google-sub-" + unique("b");
		assertThat(auth.signInWithGoogle(sub, email, "Linked Person", (ClientInfo) null).token()).isNotBlank();
		// the same person signs in again with Google, and their password still works
		assertThat(auth.signInWithGoogle(sub, email, "Linked Person", (ClientInfo) null).token()).isNotBlank();
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "Linked-pass-2026"), null).status()).isEqualTo(200);
		// a different Google account cannot take over this email
		assertThatThrowsCode(() -> auth.signInWithGoogle("google-sub-other", email, "Someone Else", (ClientInfo) null), "GOOGLE_ACCOUNT_MISMATCH");
	}

	@Test
	void staffAccountsAreNotSignedInWithGoogle() {
		assertThatThrowsCode(() -> auth.signInWithGoogle("google-sub-staff", IntegrationTest.ADMIN_EMAIL, "Admin", (ClientInfo) null), "USE_ADMIN_PAGE");
	}

	private static void assertThatThrowsCode(Runnable call, String code) {
		try {
			call.run();
			throw new AssertionError("expected " + code);
		} catch (et.tenapay.shop.common.ApiException e) {
			assertThat(e.getCode()).isEqualTo(code);
		}
	}
}
