package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** M23: with 2-step on, staff type a code after the password; a trusted device skips it until the password changes. */
class StaffTwoStepIntegrationTest extends IntegrationTest {

	private static final Pattern CODE = Pattern.compile("sign-in code: (\\d{6})");

	/** The newest code emailed to this address. */
	private String codeFor(String email) {
		return await().atMost(Duration.ofSeconds(20)).until(() -> {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q)).build(),
					HttpResponse.BodyHandlers.ofString()).body());
			for (JsonNode m : list.path("messages")) {
				Matcher x = CODE.matcher(m.path("Subject").asString());
				if (x.find()) {
					return x.group(1);
				}
			}
			return null;
		}, c -> c != null);
	}

	@Test
	void codeAfterPassword_thenTrustedDevice() {
		String admin = adminToken();
		String email = unique("staff2") + "@it.test";
		String password = "Staff-pass-2026";
		assertThat(post("/api/admin/users", Map.of("email", email, "fullName", "Two Step", "role", "SUPPORT", "password", password), admin).status())
				.isEqualTo(200);

		put("/api/admin/features/staff_two_step", Map.of("value", "true"), admin);
		try {
			// password right: a challenge, not a session
			JsonNode ch = post("/api/admin/auth/login", Map.of("email", email, "password", password)).body();
			assertThat(ch.path("twoStep").asBoolean()).isTrue();
			assertThat(ch.has("token")).isFalse();
			assertThat(ch.path("sentTo").asString()).contains("***@it.test");
			String challenge = ch.path("challengeId").asString();
			String code = codeFor(email);

			// a wrong code doesn't sign in
			String wrong = code.equals("000000") ? "111111" : "000000";
			Res bad = post("/api/admin/auth/verify", Map.of("challengeId", challenge, "code", wrong, "trustDevice", true));
			assertThat(bad.status()).isEqualTo(401);
			assertThat(bad.text("code")).isEqualTo("CODE_WRONG");

			JsonNode ok = post("/api/admin/auth/verify", Map.of("challengeId", challenge, "code", code, "trustDevice", true)).body();
			String token = ok.path("token").asString();
			String device = ok.path("deviceToken").asString();
			assertThat(token).isNotBlank();
			assertThat(device).isNotBlank();
			assertThat(get("/api/admin/orders", token).status()).isEqualTo(200);
			// a code works once
			assertThat(post("/api/admin/auth/verify", Map.of("challengeId", challenge, "code", code, "trustDevice", false)).text("code"))
					.isEqualTo("CODE_EXPIRED");

			// the trusted device skips the code; another device doesn't
			assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", password, "deviceToken", device)).body().has("token")).isTrue();
			assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", password, "deviceToken", "not-a-device")).body()
					.path("twoStep").asBoolean()).isTrue();

			// a password change ends the trust
			String userId = ok.path("user").path("id").asString();
			post("/api/admin/users/" + userId + "/reset-password", Map.of("newPassword", "Staff-pass-2027"), admin);
			assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", "Staff-pass-2027", "deviceToken", device)).body()
					.path("twoStep").asBoolean()).isTrue();
		} finally {
			put("/api/admin/features/staff_two_step", Map.of("value", "false"), admin);
		}
		// switched off: the password is enough again
		assertThat(post("/api/admin/auth/login", Map.of("email", email, "password", "Staff-pass-2027")).body().has("token")).isTrue();
	}
}
