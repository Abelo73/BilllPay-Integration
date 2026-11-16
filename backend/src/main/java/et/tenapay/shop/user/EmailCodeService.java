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
import et.tenapay.shop.notification.Notification;
import et.tenapay.shop.notification.NotificationService;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.AuthService.ClientInfo;
import lombok.extern.slf4j.Slf4j;

/**
 * Confirms an email before an email + password account is made: a 6-digit code goes to the email, and sign-up
 * succeeds only with it (when app.sign-up-email-code is on).
 *
 * <p>Same limits as phone codes: one code per email per minute and 5 per hour, 20 per network address per hour; a code
 * works for 5 minutes and for 5 tries; a new code retires the older ones. Codes are stored as an HMAC keyed with the
 * app secret.
 */
@Slf4j
@Service
public class EmailCodeService {

	public static final Duration CODE_TTL = Duration.ofMinutes(5);
	public static final Duration RESEND_AFTER = Duration.ofSeconds(60);
	public static final int MAX_PER_EMAIL_PER_HOUR = 5;
	public static final int MAX_PER_IP_PER_HOUR = 20;
	public static final int MAX_TRIES = 5;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final EmailCodeRepository codes;
	private final NotificationService notifications;
	private final TransactionTemplate tx;
	private final BillPayMode billPayMode;
	private final SmsService sms;
	private final byte[] key;

	public EmailCodeService(EmailCodeRepository codes, NotificationService notifications, TransactionTemplate tx,
			BillPayMode billPayMode, SmsService sms, AppProperties app) {
		this.codes = codes;
		this.notifications = notifications;
		this.tx = tx;
		this.billPayMode = billPayMode;
		this.sms = sms;
		this.key = ("email-code:" + app.jwtSecret()).getBytes(StandardCharsets.UTF_8);
	}

	/**
	 * @param devCode the code itself, only while mail is turned off on a test setup (SMS_DEV_CODES_IN_RESPONSE=true and
	 *                BillPay sandbox); always null otherwise
	 */
	public record CodeSent(String email, String maskedEmail, long expiresInSeconds, long resendInSeconds, boolean testMode,
			String devCode) {
	}

	public static String mask(String email) {
		int at = email.indexOf('@');
		if (at <= 0) {
			return email;
		}
		String name = email.substring(0, at);
		return name.charAt(0) + "•••" + (name.length() > 2 ? name.substring(name.length() - 1) : "") + email.substring(at);
	}

	/** Emails a new code to this (already normalized) address. */
	public CodeSent send(String email, ClientInfo client) {
		return issue(email, client, false);
	}

	/** A code for a password reset (its own email, same limits). */
	public CodeSent sendReset(String email, ClientInfo client) {
		return issue(email, client, true);
	}

	private CodeSent issue(String email, ClientInfo client, boolean reset) {
		Instant now = Instant.now();
		String code = String.format("%06d", RANDOM.nextInt(1_000_000));
		Long savedId = tx.execute(s -> {
			EmailCode last = codes.findFirstByEmailOrderByCreatedAtDesc(email).orElse(null);
			if (last != null && last.getCreatedAt().isAfter(now.minus(RESEND_AFTER))) {
				long wait = Duration.between(now, last.getCreatedAt().plus(RESEND_AFTER)).toSeconds() + 1;
				throw limited("RESEND_TOO_SOON", "Wait " + wait + " seconds before asking for a new code.", wait);
			}
			if (codes.countByEmailAndCreatedAtAfter(email, now.minus(Duration.ofHours(1))) >= MAX_PER_EMAIL_PER_HOUR) {
				throw limited("TOO_MANY_CODES", "Too many codes for this email. Try again in an hour.", 3600);
			}
			if (client != null && client.ip() != null
					&& codes.countByIpAndCreatedAtAfter(client.ip(), now.minus(Duration.ofHours(1))) >= MAX_PER_IP_PER_HOUR) {
				throw limited("TOO_MANY_CODES", "Too many codes from this network. Try again later.", 3600);
			}
			codes.retireAll(email, now);
			EmailCode c = new EmailCode();
			c.setEmail(email);
			c.setCodeHash(hash(email, code));
			c.setExpiresAt(now.plus(CODE_TTL));
			c.setIp(client == null ? null : client.ip());
			return codes.save(c).getId();
		});
		Notification.Status status = reset ? notifications.onResetCode(savedId, email, code) : notifications.onSignUpCode(savedId, email, code);
		if (status == Notification.Status.FAILED) {
			// the code never left: forget it, so the person can try again at once (no "wait 60 seconds")
			tx.executeWithoutResult(s -> codes.deleteById(savedId));
			throw new ApiException(HttpStatus.BAD_GATEWAY, "EMAIL_FAILED",
					"We couldn't send the email right now. Please try again in a minute.");
		}
		boolean mailOff = status == Notification.Status.SKIPPED;
		// on screen only while no email really goes out, on a test setup (as with phone codes)
		boolean showCode = mailOff && sms.properties().devCodesInResponse() && billPayMode.isSandbox();
		log.info("Sign-up code for {}: {}", mask(email), mailOff ? "mail is off" : "emailed");
		return new CodeSent(email, mask(email), CODE_TTL.toSeconds(), RESEND_AFTER.toSeconds(), mailOff,
				showCode ? code : null);
	}

	/** Uses up the code if it is right; otherwise a 400/429 the sign-up page shows next to the code box. */
	public void consume(String email, String code) {
		String digits = code == null ? "" : code.replaceAll("\\D", "");
		// its own transaction, so a wrong try is counted even though the sign-up then fails
		Result result = tx.execute(s -> check(email, digits));
		switch (result.outcome()) {
			case "OK" -> {
				return;
			}
			case "NO_CODE" -> throw new ApiException(HttpStatus.BAD_REQUEST, "CODE_EXPIRED", "This code has expired. Ask for a new one.");
			case "TOO_MANY_TRIES" -> throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_TRIES",
					"Too many wrong codes. Ask for a new one.");
			default -> throw new ApiException(HttpStatus.BAD_REQUEST, "WRONG_CODE", "That code is not right. Check the email and try again.",
					Map.of("triesLeft", result.triesLeft()));
		}
	}

	private record Result(String outcome, int triesLeft) {
	}

	private Result check(String email, String code) {
		Instant now = Instant.now();
		EmailCode c = codes.lockActive(email, now, PageRequest.of(0, 1)).stream().findFirst().orElse(null);
		if (c == null) {
			return new Result("NO_CODE", 0);
		}
		if (code.length() != 6 || !MessageDigest.isEqual(hash(email, code).getBytes(StandardCharsets.US_ASCII),
				c.getCodeHash().getBytes(StandardCharsets.US_ASCII))) {
			c.setAttempts(c.getAttempts() + 1);
			if (c.getAttempts() >= MAX_TRIES) {
				c.setUsedAt(now);
				return new Result("TOO_MANY_TRIES", 0);
			}
			return new Result("WRONG", MAX_TRIES - c.getAttempts());
		}
		c.setUsedAt(now);
		return new Result("OK", 0);
	}

	private ApiException limited(String code, String message, long retryAfterSeconds) {
		return new ApiException(HttpStatus.TOO_MANY_REQUESTS, code, message, Map.of("retryAfterSeconds", retryAfterSeconds));
	}

	private String hash(String email, String code) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return HexFormat.of().formatHex(mac.doFinal((email + ":" + code).getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}
}
