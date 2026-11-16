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

/**
 * Forgot password by email code: the same answer for any email, a code that works once, and a new password that
 * signs in while the old one stops working. The code is read from the test inbox, as a customer would read it.
 */
class PasswordResetIntegrationTest extends IntegrationTest {

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	/** The code in the newest password-reset email to this address; its subject never holds the code. */
	private String resetCodeEmailed(String email) {
		return await().atMost(Duration.ofSeconds(20)).until(() -> {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q)).build(),
					HttpResponse.BodyHandlers.ofString()).body());
			for (JsonNode m : list.path("messages")) {
				String subject = m.path("Subject").asString();
				if (subject.contains("password reset code")) {
					assertThat(CODE.matcher(subject).find()).as("no code in the subject").isFalse();
					JsonNode full = json.readTree(http.send(HttpRequest.newBuilder(
							URI.create(mailpitApi() + "/api/v1/message/" + m.path("ID").asString())).build(),
							HttpResponse.BodyHandlers.ofString()).body());
					Matcher x = CODE.matcher(full.path("Text").asString());
					return x.find() ? x.group(1) : null;
				}
			}
			return null;
		}, c -> c != null);
	}

	@Test
	void forgotThenResetThenSignIn() {
		String email = unique("reset") + "@it.test";
		Res reg = post("/api/auth/register", Map.of("fullName", "Forgetful Person", "email", email, "password", "Old-pass-2026"));
		assertThat(reg.status()).as(reg.raw()).isEqualTo(200);

		// any email gets the same answer, so this does not show who has an account
		Res unknown = post("/api/auth/password/forgot", Map.of("email", unique("nobody") + "@it.test"));
		assertThat(unknown.status()).isEqualTo(200);
		assertThat(unknown.body().has("devCode")).isFalse();

		// the real account gets a code by email
		Res asked = post("/api/auth/password/forgot", Map.of("email", email));
		assertThat(asked.status()).as(asked.raw()).isEqualTo(200);
		assertThat(asked.body().has("devCode")).isFalse();
		String code = resetCodeEmailed(email);

		// a wrong code is refused
		Res wrong = post("/api/auth/password/reset", Map.of("email", email, "code", code.equals("000000") ? "111111" : "000000", "newPassword", "New-pass-2026"));
		assertThat(wrong.status()).isEqualTo(400);

		// the right code sets the new password
		Res done = post("/api/auth/password/reset", Map.of("email", email, "code", code, "newPassword", "New-pass-2026"));
		assertThat(done.status()).as(done.raw()).isEqualTo(200);

		// the new password signs in; the old one does not
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "New-pass-2026")).status()).isEqualTo(200);
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "Old-pass-2026")).status()).isNotEqualTo(200);

		// the code works only once
		Res again = post("/api/auth/password/reset", Map.of("email", email, "code", code, "newPassword", "Other-pass-2026"));
		assertThat(again.status()).isNotEqualTo(200);
	}
}
