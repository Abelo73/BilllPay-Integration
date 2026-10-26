package et.tenapay.shop.user;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.notification.NotificationService;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.sms.SmsService;
import lombok.extern.slf4j.Slf4j;

/**
 * M23: 2-step sign-in for staff (Admin → Features → "2-step sign-in for staff"). After the password, a 6-digit code
 * goes by SMS (when the account has a phone) and by email; it works for 10 minutes and 5 tries. A device can be
 * trusted for 30 days: it keeps a random token, of which only a hash is stored.
 */
@Slf4j
@Service
public class StaffTwoStepService {

	public static final Duration CODE_TTL = Duration.ofMinutes(10);
	public static final Duration TRUST_FOR = Duration.ofDays(30);
	static final int MAX_TRIES = 5;

	private final JdbcTemplate jdbc;
	private final UserRepository users;
	private final AuthService auth;
	private final SmsService sms;
	private final NotificationService notifications;
	private final Features features;
	private final BillPayMode billPayMode;
	private final AppProperties app;
	private final SecureRandom random = new SecureRandom();
	private final byte[] key;

	public StaffTwoStepService(JdbcTemplate jdbc, UserRepository users, AuthService auth, SmsService sms,
			NotificationService notifications, Features features, BillPayMode billPayMode, AppProperties app) {
		this.jdbc = jdbc;
		this.users = users;
		this.auth = auth;
		this.sms = sms;
		this.notifications = notifications;
		this.features = features;
		this.billPayMode = billPayMode;
		this.app = app;
		this.key = ("staff-two-step:" + app.jwtSecret()).getBytes(StandardCharsets.UTF_8);
	}

	/** What the sign-in page needs for step 2. {@code devCode} only in local test mode (nothing is really sent). */
	public record Challenge(boolean twoStep, UUID challengeId, String sentTo, long expiresInSeconds, String devCode) {
	}

	/** After a successful password: the session at once, or a code challenge. */
	public record StaffSignIn(AuthService.Session session, Challenge challenge, String deviceToken) {
	}

	public boolean required() {
		return features.on(Features.STAFF_TWO_STEP);
	}

	/** A trusted device skips the code. */
	public boolean trusted(UUID userId, String deviceToken) {
		if (deviceToken == null || deviceToken.isBlank() || deviceToken.length() > 200) {
			return false;
		}
		int version = users.findById(userId).map(User::getTokenVersion).orElse(-1);
		int n = jdbc.update(
				"update trusted_devices set last_used_at = now() where user_id = ? and token_hash = ? and expires_at > now() and token_version = ?",
				userId, hash(deviceToken), version);
		return n > 0;
	}

	public Challenge start(User user, String ip) {
		String code = String.format("%06d", random.nextInt(1_000_000));
		UUID id = UUID.randomUUID();
		jdbc.update("insert into staff_login_codes (id, user_id, code_hash, expires_at, ip) values (?, ?, ?, ?, ?)", id, user.getId(),
				hash(id + ":" + code), java.sql.Timestamp.from(Instant.now().plus(CODE_TTL)), ip);
		StringBuilder to = new StringBuilder();
		if (user.getPhone() != null && !user.getPhone().isBlank()) {
			sms.send(SmsService.Kind.SIGN_IN_CODE, user.getPhone(), "Sodo Gebeya admin sign-in code: " + code + " (10 minutes). Don't share it.",
					"Sodo Gebeya admin sign-in code: ****** (10 minutes)", null);
			to.append(PhoneAuthService.mask(user.getPhone()));
		}
		if (user.getEmail() != null && !user.getEmail().isBlank()) {
			notifications.onStaffSignInCode(id, user.getEmail(), user.getFullName(), code);
			to.append(to.isEmpty() ? "" : " and ").append(maskEmail(user.getEmail()));
		}
		boolean showCode = !sms.delivers() && !app.mail().enabled() && sms.properties().devCodesInResponse() && billPayMode.isSandbox();
		log.info("Staff 2-step code sent to {} for {}", to, user.getEmail());
		return new Challenge(true, id, to.toString(), CODE_TTL.toSeconds(), showCode ? code : null);
	}

	/** Checks the code; on success a session, and a device token when the person ticked "trust this device". */
	public StaffSignIn verify(UUID challengeId, String code, boolean trustDevice, String deviceLabel) {
		var rows = jdbc.queryForList("select user_id, code_hash, attempts, expires_at, used_at from staff_login_codes where id = ?", challengeId);
		if (rows.isEmpty()) {
			throw wrong();
		}
		var row = rows.get(0);
		Instant expires = ((java.sql.Timestamp) row.get("expires_at")).toInstant();
		int attempts = ((Number) row.get("attempts")).intValue();
		if (row.get("used_at") != null || expires.isBefore(Instant.now()) || attempts >= MAX_TRIES) {
			throw new ApiException(HttpStatus.GONE, "CODE_EXPIRED", "This code has expired. Sign in again for a new one.");
		}
		String c = code == null ? "" : code.trim();
		boolean ok = c.length() == 6 && MessageDigest.isEqual(hash(challengeId + ":" + c).getBytes(StandardCharsets.US_ASCII),
				String.valueOf(row.get("code_hash")).getBytes(StandardCharsets.US_ASCII));
		if (!ok) {
			jdbc.update("update staff_login_codes set attempts = attempts + 1 where id = ?", challengeId);
			throw wrong();
		}
		int claimed = jdbc.update("update staff_login_codes set used_at = now() where id = ? and used_at is null", challengeId);
		if (claimed == 0) {
			throw new ApiException(HttpStatus.GONE, "CODE_EXPIRED", "This code was already used. Sign in again.");
		}
		User user = users.findById((UUID) row.get("user_id")).filter(User::isEnabled)
				.orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "This account is disabled."));
		String token = null;
		if (trustDevice) {
			byte[] raw = new byte[32];
			random.nextBytes(raw);
			token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
			jdbc.update("insert into trusted_devices (user_id, token_hash, label, expires_at, token_version) values (?, ?, ?, ?, ?)", user.getId(), hash(token),
					deviceLabel == null ? null : deviceLabel.substring(0, Math.min(deviceLabel.length(), 200)),
					java.sql.Timestamp.from(Instant.now().plus(TRUST_FOR)), user.getTokenVersion());
		}
		return new StaffSignIn(auth.session(user), null, token);
	}

	/** Signs out every trusted device of a person (e.g. after a password change). */
	public int forgetDevices(UUID userId) {
		return jdbc.update("delete from trusted_devices where user_id = ?", userId);
	}

	static String maskEmail(String email) {
		int at = email.indexOf('@');
		if (at <= 1) {
			return email;
		}
		return email.charAt(0) + "***" + email.substring(at);
	}

	private static ApiException wrong() {
		return new ApiException(HttpStatus.UNAUTHORIZED, "CODE_WRONG", "That code isn't right. Check the SMS or email and try again.");
	}

	private String hash(String value) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}
}
