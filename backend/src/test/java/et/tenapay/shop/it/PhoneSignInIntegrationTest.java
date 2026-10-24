package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/** Sign in with a phone number and an SMS code (test mode: the code comes back in the response). */
class PhoneSignInIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	/** A fresh Ethiopian mobile number, local format (09XXXXXXXX). */
	private static String newPhone() {
		return "09" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
	}

	private static String intl(String local) {
		return "+251" + local.substring(1);
	}

	private String requestCode(String phone) {
		Res r = post("/api/auth/phone/start", Map.of("phone", phone));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		assertThat(r.body().path("testMode").asBoolean()).isTrue();
		return r.text("devCode");
	}

	/** Lets the next code be requested now instead of after the one-minute wait. */
	private void forgetLastCodeTime(String phone) {
		jdbc.update("update phone_codes set created_at = now() - interval '2 minutes' where phone = ?", intl(phone));
	}

	@Test
	void newPhoneAsksForNameThenCreatesAPhoneOnlyAccount() {
		String phone = newPhone();
		Res start = post("/api/auth/phone/start", Map.of("phone", phone.substring(0, 4) + " " + phone.substring(4)));
		assertThat(start.status()).as(start.raw()).isEqualTo(200);
		assertThat(start.text("phone")).isEqualTo(intl(phone));
		assertThat(start.text("maskedPhone")).endsWith(phone.substring(7)).doesNotContain(phone.substring(4, 7));
		String code = start.text("devCode");
		assertThat(code).matches("\\d{6}");

		Res noName = post("/api/auth/phone/verify", Map.of("phone", phone, "code", code));
		assertThat(noName.status()).isEqualTo(422);
		assertThat(noName.text("code")).isEqualTo("NAME_REQUIRED");

		// the same code still works for the second step
		Res signedIn = post("/api/auth/phone/verify", Map.of("phone", phone, "code", code, "fullName", "Almaz Bekele"));
		assertThat(signedIn.status()).as(signedIn.raw()).isEqualTo(200);
		JsonNode user = signedIn.body().path("user");
		assertThat(user.path("fullName").asString()).isEqualTo("Almaz Bekele");
		assertThat(user.path("phone").asString()).isEqualTo(intl(phone));
		assertThat(user.path("phoneVerified").asBoolean()).isTrue();
		assertThat(user.path("hasPassword").asBoolean()).isFalse();
		assertThat(user.path("email").isNull()).isTrue();

		String token = signedIn.text("token");
		assertThat(get("/api/me", token).body().path("fullName").asString()).isEqualTo("Almaz Bekele");

		// a code is single-use
		assertThat(post("/api/auth/phone/verify", Map.of("phone", phone, "code", code)).text("code")).isEqualTo("CODE_EXPIRED");

		// the SMS log keeps the message but never the code
		Res log = get("/api/admin/sms?q=" + intl(phone).substring(1), adminToken());
		assertThat(log.status()).as(log.raw()).isEqualTo(200);
		JsonNode row = log.body().path("page").path("content").get(0);
		assertThat(row.path("kind").asString()).isEqualTo("SIGN_IN_CODE");
		assertThat(row.path("status").asString()).isEqualTo("LOGGED");
		assertThat(row.path("body").asString()).doesNotContain(code).contains("••••••");
		assertThat(log.body().path("setup").path("delivering").asBoolean()).isFalse();
	}

	@Test
	void returningPhoneSignsIntoTheSameAccount() {
		String phone = newPhone();
		String first = post("/api/auth/phone/verify", Map.of("phone", phone, "code", requestCode(phone), "fullName", "Yohannes T."))
				.body().path("user").path("id").asString();

		forgetLastCodeTime(phone);
		Res again = post("/api/auth/phone/verify", Map.of("phone", phone, "code", requestCode(phone)));
		assertThat(again.status()).as(again.raw()).isEqualTo(200);
		assertThat(again.body().path("user").path("id").asString()).isEqualTo(first);
		assertThat(again.body().path("user").path("fullName").asString()).isEqualTo("Yohannes T.");
	}

	@Test
	void wrongCodesCountDownThenTheCodeIsDead() {
		String phone = newPhone();
		String code = requestCode(phone);
		String wrong = code.equals("000000") ? "111111" : "000000";
		for (int left = 4; left >= 1; left--) {
			Res r = post("/api/auth/phone/verify", Map.of("phone", phone, "code", wrong, "fullName", "X"));
			assertThat(r.status()).isEqualTo(400);
			assertThat(r.text("code")).isEqualTo("WRONG_CODE");
			assertThat(r.body().path("triesLeft").asInt()).isEqualTo(left);
		}
		Res fifth = post("/api/auth/phone/verify", Map.of("phone", phone, "code", wrong, "fullName", "X"));
		assertThat(fifth.status()).isEqualTo(429);
		assertThat(fifth.text("code")).isEqualTo("TOO_MANY_TRIES");
		// even the right code no longer works
		assertThat(post("/api/auth/phone/verify", Map.of("phone", phone, "code", code, "fullName", "X")).text("code"))
				.isEqualTo("CODE_EXPIRED");
	}

	@Test
	void newCodeOnlyOncePerMinuteAndItReplacesTheOldOne() {
		String phone = newPhone();
		String old = requestCode(phone);
		Res tooSoon = post("/api/auth/phone/start", Map.of("phone", phone));
		assertThat(tooSoon.status()).isEqualTo(429);
		assertThat(tooSoon.text("code")).isEqualTo("RESEND_TOO_SOON");
		assertThat(tooSoon.body().path("retryAfterSeconds").asInt()).isBetween(1, 61);

		forgetLastCodeTime(phone);
		String fresh = requestCode(phone);
		if (!fresh.equals(old)) {
			assertThat(post("/api/auth/phone/verify", Map.of("phone", phone, "code", old, "fullName", "X")).text("code"))
					.isEqualTo("WRONG_CODE");
		}
		assertThat(post("/api/auth/phone/verify", Map.of("phone", phone, "code", fresh, "fullName", "Fresh")).status()).isEqualTo(200);
	}

	@Test
	void onlyEthiopianMobileNumbers() {
		for (String bad : new String[] { "12345", "0112345678", "+254711234567", "0811234567" }) {
			Res r = post("/api/auth/phone/start", Map.of("phone", bad));
			assertThat(r.status()).as(bad).isEqualTo(400);
			assertThat(r.text("code")).as(bad).isEqualTo("INVALID_PHONE");
		}
		// Safaricom (07) numbers are fine
		assertThat(post("/api/auth/phone/start", Map.of("phone", "07" + newPhone().substring(2))).status()).isEqualTo(200);
	}

	@Test
	void staffCantUseThePhoneDoor() {
		String phone = newPhone();
		jdbc.update("update users set phone = ?, phone_verified_at = now() where email = ?", intl(phone), ADMIN_EMAIL);
		try {
			Res r = post("/api/auth/phone/verify", Map.of("phone", phone, "code", requestCode(phone)));
			assertThat(r.status()).isEqualTo(403);
			assertThat(r.text("code")).isEqualTo("STAFF_ACCOUNT");
		} finally {
			jdbc.update("update users set phone = null, phone_verified_at = null where email = ?", ADMIN_EMAIL);
		}
	}

	@Test
	void phoneAccountsHaveNoPasswordAndKeepTheirPhone() {
		String phone = newPhone();
		String token = post("/api/auth/phone/verify", Map.of("phone", phone, "code", requestCode(phone), "fullName", "Sara"))
				.text("token");

		Res pw = post("/api/me/password", Map.of("currentPassword", "x", "newPassword", "Str0ng-pass-2026"), token);
		assertThat(pw.status()).isEqualTo(400);
		assertThat(pw.text("code")).isEqualTo("NO_PASSWORD");

		Res change = patch("/api/me", Map.of("fullName", "Sara K.", "phone", newPhone()), token);
		assertThat(change.status()).isEqualTo(409);
		assertThat(change.text("code")).isEqualTo("PHONE_LOCKED");

		Res rename = patch("/api/me", Map.of("fullName", "Sara K.", "phone", phone), token);
		assertThat(rename.status()).as(rename.raw()).isEqualTo(200);
		assertThat(rename.body().path("fullName").asString()).isEqualTo("Sara K.");

		// email sign-in can't reach a phone-only account
		assertThat(post("/api/auth/login", Map.of("email", "nobody@it.test", "password", "whatever")).status()).isEqualTo(401);
	}
}
