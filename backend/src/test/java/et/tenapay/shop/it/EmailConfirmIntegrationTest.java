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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import tools.jackson.databind.JsonNode;

/**
 * Email confirmation at sign-in: sign-up with the code marks the email confirmed; an account that was never confirmed
 * (made before the check) gets a code at sign-in and signs in only with it.
 */
@TestPropertySource(properties = "app.sign-up-email-code=true")
class EmailConfirmIntegrationTest extends IntegrationTest {

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	@Autowired
	JdbcTemplate jdbc;

	/** The code in the newest email to this address whose subject contains {@code subjectPart} (the subject never holds the code). */
	private String codeEmailed(String email, String subjectPart) {
		return await().atMost(Duration.ofSeconds(20)).until(() -> {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q)).build(),
					HttpResponse.BodyHandlers.ofString()).body());
			for (JsonNode m : list.path("messages")) {
				if (m.path("Subject").asString().contains(subjectPart)) {
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
	void anUnconfirmedAccountConfirmsWithTheEmailedCodeThenSignsIn() {
		String email = unique("confirm") + "@it.test";
		Map<String, Object> form = Map.of("fullName", "Old Account", "email", email, "password", "Old-account-2026");

		// sign-up with the code confirms the email at once
		assertThat(post("/api/auth/register", form).status()).isEqualTo(422);
		String signUpCode = codeEmailed(email, "sign-up code");
		Map<String, Object> withCode = Map.of("fullName", "Old Account", "email", email, "password", "Old-account-2026", "code", signUpCode);
		assertThat(post("/api/auth/register", withCode).status()).isEqualTo(200);
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "Old-account-2026")).status()).isEqualTo(200);

		// an account made before the check: no confirmed time yet, and its sign-up code is long gone (a new code
		// waits one minute after the last one, so the test clears that wait instead of sleeping)
		jdbc.update("update users set email_verified_at = null where email = ?", email);
		jdbc.update("delete from email_codes where email = ?", email);

		// the right password is not enough: a code is emailed and sign-in waits
		Res blocked = post("/api/auth/login", Map.of("email", email, "password", "Old-account-2026"));
		assertThat(blocked.status()).as(blocked.raw()).isEqualTo(403);
		assertThat(blocked.body().path("code").asString()).isEqualTo("EMAIL_NOT_VERIFIED");
		assertThat(blocked.body().path("maskedEmail").asString()).endsWith("@it.test").doesNotContain("confirm");
		String code = codeEmailed(email, "confirmation code");

		// a wrong code is refused
		String wrong = code.equals("000000") ? "111111" : "000000";
		assertThat(post("/api/auth/email/confirm", Map.of("email", email, "password", "Old-account-2026", "code", wrong)).status()).isEqualTo(400);

		// the right code confirms the email and signs in
		Res ok = post("/api/auth/email/confirm", Map.of("email", email, "password", "Old-account-2026", "code", code));
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		assertThat(ok.body().path("token").asString()).isNotBlank();

		// from now on the password signs in directly
		assertThat(post("/api/auth/login", Map.of("email", email, "password", "Old-account-2026")).status()).isEqualTo(200);
	}
}
