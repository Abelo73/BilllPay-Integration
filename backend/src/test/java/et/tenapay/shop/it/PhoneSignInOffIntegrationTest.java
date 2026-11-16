package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** With app.phone-sign-in off (the default), the phone endpoints answer 404, so no SMS is sent and no account is made. */
@TestPropertySource(properties = "app.phone-sign-in=false")
class PhoneSignInOffIntegrationTest extends IntegrationTest {

	@Test
	void phoneStartAndVerifyAreNotFound() {
		Res start = post("/api/auth/phone/start", Map.of("phone", "0911223344"));
		assertThat(start.status()).as(start.raw()).isEqualTo(404);

		Res verify = post("/api/auth/phone/verify", Map.of("phone", "0911223344", "code", "123456", "fullName", "Test Person"));
		assertThat(verify.status()).as(verify.raw()).isEqualTo(404);
	}

	@Test
	void emailSignUpStillWorks() {
		Res r = post("/api/auth/register", Map.of("fullName", "Email Only", "email", "email-only-" + System.nanoTime() + "@example.com",
				"password", "Sodo-Test-2026!"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
	}
}
