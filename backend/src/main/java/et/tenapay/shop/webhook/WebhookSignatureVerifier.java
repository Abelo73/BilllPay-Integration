package et.tenapay.shop.webhook;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import et.tenapay.shop.payment.billpay.BillPayProperties;
import et.tenapay.shop.payment.billpay.BillPayProperties.Verification;
import lombok.extern.slf4j.Slf4j;

/**
 * Checks that a callback really came from BillPay. BillPay signs events with a per-endpoint secret, but the exact
 * format is still unconfirmed (open question Q3), so the common HMAC-SHA256 layouts are supported:
 * <ul>
 * <li>{@code <hex|base64>} or {@code sha256=<hex|base64>} over the raw body</li>
 * <li>{@code t=<ts>,v1=<sig>} over {@code "<ts>.<body>"} (Stripe style)</li>
 * <li>a separate timestamp header, signed as {@code "<ts>.<body>"} or {@code "<ts><body>"}</li>
 * </ul>
 * In NONE mode with a secret configured, every signature-like header is probed and the matching scheme is reported,
 * so one test delivery from the dashboard tells us BillPay's format.
 */
@Slf4j
@Component
public class WebhookSignatureVerifier {

	public enum Result { VALID, INVALID, NOT_CHECKED }

	/** {@code scheme} names what matched (or what was probed), for the webhook log. */
	public record Outcome(Result result, String scheme) {
	}

	private final BillPayProperties.Webhook config;

	public WebhookSignatureVerifier(BillPayProperties props) {
		this.config = props.webhook();
		if (config.verification() == Verification.NONE && !props.isSandbox()) {
			throw new IllegalStateException("Unsigned webhooks are only allowed against the BillPay sandbox. "
					+ "Set BILLPAY_WEBHOOK_VERIFICATION and BILLPAY_WEBHOOK_SECRET before using live keys.");
		}
		if (config.verification() == Verification.NONE) {
			log.warn("BillPay webhook signatures are NOT enforced (sandbox only). Anyone who can reach the "
					+ "webhook URL could forge a payment update.{}", hasSecret()
							? " A secret is set, so each delivery is probed to detect BillPay's signing scheme."
							: " Set BILLPAY_WEBHOOK_SECRET to probe BillPay's signing scheme.");
		}
	}

	public Outcome verify(String rawBody, Map<String, String> headers) {
		if (config.verification() == Verification.NONE) {
			if (!hasSecret()) {
				return new Outcome(Result.NOT_CHECKED, null);
			}
			String detected = probe(rawBody, headers);
			if (detected != null) {
				log.info("Webhook signature probe: {} — set BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256 and "
						+ "BILLPAY_WEBHOOK_SIGNATURE_HEADER accordingly", detected);
			}
			return new Outcome(Result.NOT_CHECKED, detected != null ? "probe: " + detected : "probe: no match");
		}
		if (!hasSecret()) {
			return new Outcome(Result.INVALID, "no secret configured");
		}
		String value = header(headers, config.signatureHeader());
		if (value == null) {
			return new Outcome(Result.INVALID, "missing header " + config.signatureHeader());
		}
		String scheme = match(rawBody, value, timestamps(headers));
		return scheme != null ? new Outcome(Result.VALID, config.signatureHeader() + " " + scheme)
				: new Outcome(Result.INVALID, "signature mismatch");
	}

	private boolean hasSecret() {
		return config.secret() != null && !config.secret().isBlank();
	}

	private String probe(String body, Map<String, String> headers) {
		List<String> timestamps = timestamps(headers);
		for (Map.Entry<String, String> h : headers.entrySet()) {
			String name = h.getKey().toLowerCase(Locale.ROOT);
			if (name.contains("sign") || name.contains("hmac")) {
				String scheme = match(body, h.getValue(), timestamps);
				if (scheme != null) {
					return "header '" + h.getKey() + "' = " + scheme;
				}
			}
		}
		return null;
	}

	/** Returns a description of the scheme that matched, or null. */
	private String match(String body, String headerValue, List<String> timestampHeaders) {
		String value = headerValue.trim();
		for (byte[] key : keys()) {
			if (value.contains("v1=") || value.startsWith("t=")) {
				String ts = null;
				List<String> sigs = new ArrayList<>();
				for (String part : value.split(",")) {
					String[] kv = part.trim().split("=", 2);
					if (kv.length == 2 && kv[0].equals("t")) {
						ts = kv[1];
					} else if (kv.length == 2 && kv[0].startsWith("v")) {
						sigs.add(kv[1]);
					}
				}
				if (ts != null) {
					byte[] mac = hmac(key, ts + "." + body);
					for (String sig : sigs) {
						if (equalsEncoded(mac, sig)) {
							return "hmac-sha256 t=<ts>,v1=<sig> over '<ts>.<body>'";
						}
					}
				}
				continue;
			}
			String sig = value.regionMatches(true, 0, "sha256=", 0, 7) ? value.substring(7) : value;
			if (equalsEncoded(hmac(key, body), sig)) {
				return "hmac-sha256 over raw body";
			}
			for (String ts : timestampHeaders) {
				if (equalsEncoded(hmac(key, ts + "." + body), sig)) {
					return "hmac-sha256 over '<timestamp header>.<body>'";
				}
				if (equalsEncoded(hmac(key, ts + body), sig)) {
					return "hmac-sha256 over '<timestamp header><body>'";
				}
			}
		}
		return null;
	}

	/** The secret as raw text, plus base64-decoded when it looks like "whsec_<base64>". */
	private List<byte[]> keys() {
		String secret = config.secret().trim();
		List<byte[]> keys = new ArrayList<>();
		keys.add(secret.getBytes(StandardCharsets.UTF_8));
		int underscore = secret.indexOf('_');
		if (underscore > 0) {
			try {
				keys.add(Base64.getDecoder().decode(secret.substring(underscore + 1)));
			} catch (IllegalArgumentException ignored) {
				// not base64; raw text key only
			}
		}
		return keys;
	}

	private static List<String> timestamps(Map<String, String> headers) {
		return headers.entrySet().stream()
				.filter(e -> e.getKey().toLowerCase(Locale.ROOT).contains("timestamp"))
				.map(Map.Entry::getValue)
				.toList();
	}

	private static boolean equalsEncoded(byte[] mac, String given) {
		byte[] givenBytes = given.trim().getBytes(StandardCharsets.UTF_8);
		byte[] hex = HexFormat.of().formatHex(mac).getBytes(StandardCharsets.UTF_8);
		byte[] b64 = Base64.getEncoder().encodeToString(mac).getBytes(StandardCharsets.UTF_8);
		byte[] b64url = Base64.getUrlEncoder().withoutPadding().encodeToString(mac).getBytes(StandardCharsets.UTF_8);
		return MessageDigest.isEqual(hex, given.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8))
				| MessageDigest.isEqual(b64, givenBytes)
				| MessageDigest.isEqual(b64url, givenBytes);
	}

	private static String header(Map<String, String> headers, String name) {
		return headers.entrySet().stream()
				.filter(e -> e.getKey().equalsIgnoreCase(name))
				.map(Map.Entry::getValue)
				.findFirst().orElse(null);
	}

	private static byte[] hmac(byte[] key, String data) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}
}
