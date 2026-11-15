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
import org.springframework.test.context.TestPropertySource;

import tools.jackson.databind.JsonNode;

/** Email + password sign-up with a code: the account is made only with the 6-digit code emailed to that address. */
@TestPropertySource(properties = "app.sign-up-email-code=true")
class EmailSignUpIntegrationTest extends IntegrationTest {

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	/** The code in the newest sign-up email to this address; its subject never holds the code. */
	private String emailedCode(String email) {
		return await().atMost(Duration.ofSeconds(20)).until(() -> {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q)).build(),
					HttpResponse.BodyHandlers.ofString()).body());
			for (JsonNode m : list.path("messages")) {
				String subject = m.path("Subject").asString();
				if (subject.contains("sign-up code")) {
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
	void accountOnlyWithTheEmailedCode() {
		String email = unique("signup") + "@it.test";
		Map<String, Object> form = Map.of("fullName", "Code Shopper", "email", email, "password", "Shopper-pass-2026");

		// first try: no account yet, a code goes to the email
		Res first = post("/api/auth/register", form);
		assertThat(first.status()).isEqualTo(422);
		assertThat(first.body().path("code").asString()).isEqualTo("EMAIL_CODE_SENT");
		assertThat(first.body().path("maskedEmail").asString()).endsWith("@it.test").doesNotContain("signup");
		assertThat(first.body().path("testMode").asBoolean()).isFalse();
		assertThat(first.body().has("devCode")).isFalse();
		String code = emailedCode(email);

		// a wrong code is refused and counted
		String wrong = code.equals("000000") ? "111111" : "000000";
		Res bad = post("/api/auth/register", withCode(form, wrong));
		assertThat(bad.status()).isEqualTo(400);
		assertThat(bad.body().path("code").asString()).isEqualTo("WRONG_CODE");
		assertThat(bad.body().path("triesLeft").asInt()).isEqualTo(4);

		// the right code makes the account and signs in
		Res ok = post("/api/auth/register", withCode(form, code));
		assertThat(ok.status()).isEqualTo(200);
		assertThat(ok.body().path("token").asString()).isNotBlank();

		// the code works once, and the email is now taken
		assertThat(post("/api/auth/register", withCode(form, code)).body().path("code").asString()).isEqualTo("CODE_EXPIRED");
		assertThat(post("/api/auth/register", form).body().path("code").asString()).isEqualTo("EMAIL_TAKEN");
		assertThat(post("/api/auth/email/resend", Map.of("email", email)).status()).isEqualTo(409);
	}

	@Test
	void weakPasswordIsRefusedBeforeAnyEmail() {
		Res r = post("/api/auth/register", Map.of("fullName", "Weak", "email", unique("weak") + "@it.test", "password", "short"));
		assertThat(r.status()).isEqualTo(400);
		assertThat(r.body().path("code").asString()).isNotEqualTo("EMAIL_CODE_SENT");
	}

	@Test
	void newCodeOnlyAfterAMinute() {
		String email = unique("resend") + "@it.test";
		assertThat(post("/api/auth/register", Map.of("fullName", "Resend", "email", email, "password", "Shopper-pass-2026")).status())
				.isEqualTo(422);
		Res again = post("/api/auth/email/resend", Map.of("email", email));
		assertThat(again.status()).isEqualTo(429);
		assertThat(again.body().path("code").asString()).isEqualTo("RESEND_TOO_SOON");
	}

	/**
	 * This class runs its own app (different settings), whose feature switches don't reach the shared one: make the next
	 * class switch online payments on again in its own app.
	 */
	@org.junit.jupiter.api.AfterAll
	static void otherAppsSwitchPaymentsOnAgain() {
		onlinePaymentsOn = false;
	}

	private static Map<String, Object> withCode(Map<String, Object> form, String code) {
		Map<String, Object> m = new java.util.HashMap<>(form);
		m.put("code", code);
		return m;
	}
}
