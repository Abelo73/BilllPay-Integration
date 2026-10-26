package et.tenapay.shop.user;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.order.CheckoutService;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.AuthService.ClientInfo;
import et.tenapay.shop.user.AuthService.Portal;
import et.tenapay.shop.user.AuthService.Session;
import lombok.extern.slf4j.Slf4j;

/**
 * Sign in with a phone number: request a 6-digit code by SMS, then send it back. A phone that has never signed in
 * creates a new customer account (a name is asked for on that first sign-in). Staff can't use this door.
 *
 * <p>Limits: one code per phone per minute and 5 per hour, 20 per network address per hour; a code works for 5 minutes
 * and for 5 tries. Codes are stored as an HMAC keyed with the app secret.
 */
@Slf4j
@Service
public class PhoneAuthService {

	public static final Duration CODE_TTL = Duration.ofMinutes(5);
	public static final Duration RESEND_AFTER = Duration.ofSeconds(60);
	public static final int MAX_PER_PHONE_PER_HOUR = 5;
	public static final int MAX_PER_IP_PER_HOUR = 20;
	public static final int MAX_TRIES = 5;

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final java.util.regex.Pattern MOBILE = java.util.regex.Pattern.compile("^\\+251[79]\\d{8}$");

	private final PhoneCodeRepository codes;
	private final UserRepository users;
	private final AuthService auth;
	private final SmsService sms;
	private final TransactionTemplate tx;
	private final ShopMetrics metrics;
	private final BillPayMode billPayMode;
	private final byte[] key;

	public PhoneAuthService(PhoneCodeRepository codes, UserRepository users, AuthService auth, SmsService sms,
			TransactionTemplate tx, ShopMetrics metrics, BillPayMode billPayMode, AppProperties app) {
		this.codes = codes;
		this.users = users;
		this.auth = auth;
		this.sms = sms;
		this.tx = tx;
		this.metrics = metrics;
		this.billPayMode = billPayMode;
		this.key = ("phone-code:" + app.jwtSecret()).getBytes(StandardCharsets.UTF_8);
	}

	/**
	 * @param devCode the code itself, only in local test mode (no SMS provider, sms.dev-codes-in-response=true, BillPay
	 *                sandbox); always null otherwise
	 */
	public record CodeSent(String phone, String maskedPhone, long expiresInSeconds, long resendInSeconds, boolean testMode,
			String devCode) {
	}

	/** Ethiopian mobile number in +2519XXXXXXXX / +2517XXXXXXXX form, or a 400. */
	public static String mobile(String input) {
		String p = input == null ? "" : CheckoutService.normalizePhone(input);
		if (!MOBILE.matcher(p).matches()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PHONE",
					"Enter an Ethiopian mobile number, like 0911 234 567 or 0711 234 567.");
		}
		return p;
	}

	public static String mask(String phone) {
		return phone.substring(0, phone.length() - 7) + " •• •" + phone.substring(phone.length() - 3);
	}

	public CodeSent sendCode(String rawPhone, ClientInfo client) {
		return sendCode(rawPhone, client, null);
	}

	/** {@code language} "am" sends the code in Amharic; anything else in English. */
	public CodeSent sendCode(String rawPhone, ClientInfo client, String language) {
		String phone = mobile(rawPhone);
		Instant now = Instant.now();
		String code = String.format("%06d", RANDOM.nextInt(1_000_000));
		Long savedId = tx.execute(s -> {
			PhoneCode last = codes.findFirstByPhoneOrderByCreatedAtDesc(phone).orElse(null);
			if (last != null && last.getCreatedAt().isAfter(now.minus(RESEND_AFTER))) {
				long wait = Duration.between(now, last.getCreatedAt().plus(RESEND_AFTER)).toSeconds() + 1;
				throw limited("RESEND_TOO_SOON", "Wait " + wait + " seconds before asking for a new code.", wait);
			}
			if (codes.countByPhoneAndCreatedAtAfter(phone, now.minus(Duration.ofHours(1))) >= MAX_PER_PHONE_PER_HOUR) {
				throw limited("TOO_MANY_CODES", "Too many codes for this number. Try again in an hour.", 3600);
			}
			if (client != null && client.ip() != null
					&& codes.countByIpAndCreatedAtAfter(client.ip(), now.minus(Duration.ofHours(1))) >= MAX_PER_IP_PER_HOUR) {
				throw limited("TOO_MANY_CODES", "Too many codes from this network. Try again later.", 3600);
			}
			codes.retireAll(phone, now);
			PhoneCode c = new PhoneCode();
			c.setPhone(phone);
			c.setCodeHash(hash(phone, code));
			c.setExpiresAt(now.plus(CODE_TTL));
			c.setIp(client == null ? null : client.ip());
			return codes.save(c).getId();
		});
		String text = et.tenapay.shop.sms.SmsLanguage.AMHARIC.equals(et.tenapay.shop.sms.SmsLanguage.normalize(language))
				? "የሶዶ ገበያ ኮድ፦ " + code + "። በ5 ደቂቃ ያበቃል። ለማንም፣ ለሠራተኞቻችንም ቢሆን አያጋሩ።"
				: "Sodo Gebeya code: " + code + ". It expires in 5 minutes. Never share it, not even with our staff.";
		SmsService.Sent sent = sms.send(SmsService.Kind.SIGN_IN_CODE, phone, text, text.replace(code, "••••••"), null);
		if (!sent.ok()) {
			metrics.phoneSignIn("sms_failed");
			// the code never left: forget it, so the person can try again at once (no "wait 60 seconds")
			tx.executeWithoutResult(s -> codes.deleteById(savedId));
			throw new ApiException(HttpStatus.BAD_GATEWAY, "SMS_FAILED",
					"We couldn't send the SMS right now. Please try again in a minute.");
		}
		metrics.phoneSignIn("sent");
		boolean showCode = !sms.delivers() && sms.properties().devCodesInResponse() && billPayMode.isSandbox();
		return new CodeSent(phone, mask(phone), CODE_TTL.toSeconds(), RESEND_AFTER.toSeconds(), !sms.delivers(),
				showCode ? code : null);
	}

	/**
	 * Checks the code and signs in. A phone without an account needs {@code fullName}: without it the answer is
	 * 422 NAME_REQUIRED and the code stays valid, so the shop can ask for the name and send both again.
	 */
	public Session verify(String rawPhone, String code, String fullName, ClientInfo client) {
		String phone = mobile(rawPhone);
		String digits = code == null ? "" : code.replaceAll("\\D", "");
		Outcome outcome = tx.execute(s -> check(phone, digits, fullName, client));
		return switch (outcome.result()) {
			case "OK" -> {
				metrics.phoneSignIn(outcome.created() ? "registered" : "verified");
				yield auth.session(outcome.user());
			}
			case "NAME_REQUIRED" -> throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "NAME_REQUIRED",
					"Welcome! Tell us your name to finish creating your account.");
			case "NO_CODE" -> fail("no_code", HttpStatus.BAD_REQUEST, "CODE_EXPIRED", "This code has expired. Ask for a new one.", Map.of());
			case "TOO_MANY_TRIES" -> fail("too_many_tries", HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_TRIES",
					"Too many wrong codes. Ask for a new one.", Map.of());
			case "STAFF" -> fail("staff", HttpStatus.FORBIDDEN, "STAFF_ACCOUNT",
					"This number belongs to a staff account. Staff sign in at /admin with email and password.", Map.of());
			case "DISABLED" -> fail("disabled", HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "This account is disabled. Contact support.", Map.of());
			default -> fail("wrong_code", HttpStatus.BAD_REQUEST, "WRONG_CODE", "That code is not right. Check the SMS and try again.",
					Map.of("triesLeft", outcome.triesLeft()));
		};
	}

	private record Outcome(String result, User user, boolean created, int triesLeft) {

		static Outcome of(String result) {
			return new Outcome(result, null, false, 0);
		}
	}

	private Outcome check(String phone, String code, String fullName, ClientInfo client) {
		Instant now = Instant.now();
		PhoneCode c = codes.lockActive(phone, now, PageRequest.of(0, 1)).stream().findFirst().orElse(null);
		if (c == null) {
			return Outcome.of("NO_CODE");
		}
		if (code.length() != 6 || !MessageDigest.isEqual(hash(phone, code).getBytes(StandardCharsets.US_ASCII),
				c.getCodeHash().getBytes(StandardCharsets.US_ASCII))) {
			c.setAttempts(c.getAttempts() + 1);
			if (c.getAttempts() >= MAX_TRIES) {
				c.setUsedAt(now);
				auth.record(null, phone, Portal.SHOP, false, "PHONE_CODE_LOCKED", client);
				return Outcome.of("TOO_MANY_TRIES");
			}
			auth.record(null, phone, Portal.SHOP, false, "WRONG_CODE", client);
			return new Outcome("WRONG", null, false, MAX_TRIES - c.getAttempts());
		}

		User user = users.findByPhoneAndPhoneVerifiedAtIsNotNull(phone).orElse(null);
		if (user != null && user.getRole().isStaff()) {
			c.setUsedAt(now);
			auth.record(user, phone, Portal.SHOP, false, "WRONG_PORTAL", client);
			return Outcome.of("STAFF");
		}
		if (user != null && !user.isEnabled()) {
			c.setUsedAt(now);
			auth.record(user, phone, Portal.SHOP, false, "DISABLED", client);
			return Outcome.of("DISABLED");
		}
		boolean created = false;
		if (user == null) {
			if (fullName == null || fullName.isBlank()) {
				return Outcome.of("NAME_REQUIRED"); // code stays valid for the second step
			}
			user = new User();
			user.setFullName(fullName.trim().length() > 200 ? fullName.trim().substring(0, 200) : fullName.trim());
			user.setPhone(phone);
			user.setPhoneVerifiedAt(now);
			user.setRole(Role.CUSTOMER);
			users.save(user);
			created = true;
		}
		c.setUsedAt(now);
		user.setFailedLogins(0);
		user.setLockedUntil(null);
		user.setLastLoginAt(now);
		auth.record(user, phone, Portal.SHOP, true, created ? "REGISTERED_PHONE" : "SUCCESS_PHONE", client);
		return new Outcome("OK", user, created, MAX_TRIES);
	}

	private Session fail(String metric, HttpStatus status, String code, String message, Map<String, Object> extra) {
		metrics.phoneSignIn(metric);
		throw new ApiException(status, code, message, extra);
	}

	private ApiException limited(String code, String message, long retryAfterSeconds) {
		metrics.phoneSignIn("rate_limited");
		return new ApiException(HttpStatus.TOO_MANY_REQUESTS, code, message, Map.of("retryAfterSeconds", retryAfterSeconds));
	}

	private String hash(String phone, String code) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return HexFormat.of().formatHex(mac.doFinal((phone + ":" + code).getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}
}
