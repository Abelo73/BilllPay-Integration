package et.tenapay.shop.seller;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns an ID number into a keyed hash (HMAC-SHA256) so duplicates can be found without storing the number.
 * The key is {@code IDENTITY_HMAC_KEY}: 32 random bytes, base64, kept like TOKEN_MASTER_KEY (see the key custody doc).
 * Without a key the hasher is not configured, and the ID-number step refuses (fail closed): it never falls back to
 * storing the number or skipping the check.
 */
@Component
public class IdNumberHasher {

	/** Letters and digits only, after spaces, dashes and slashes are removed. Length range to confirm with the ID format. */
	private static final Pattern ALLOWED = Pattern.compile("^[A-Z0-9]{6,30}$");

	private final SecretKeySpec key;

	public IdNumberHasher(@Value("${app.identity-hmac-key:}") String base64Key) {
		if (base64Key == null || base64Key.isBlank()) {
			this.key = null;
			return;
		}
		byte[] raw = Base64.getDecoder().decode(base64Key.trim());
		if (raw.length < 32) {
			throw new IllegalStateException("IDENTITY_HMAC_KEY must be at least 32 random bytes, base64 encoded");
		}
		this.key = new SecretKeySpec(raw, "HmacSHA256");
	}

	public boolean configured() {
		return key != null;
	}

	/** Upper case, without spaces, dashes or slashes. Null when the text cannot be an ID number. */
	public static String normalize(String raw) {
		if (raw == null) {
			return null;
		}
		String cleaned = raw.toUpperCase(Locale.ROOT).replaceAll("[\\s\\-/]", "");
		return ALLOWED.matcher(cleaned).matches() ? cleaned : null;
	}

	/** The keyed hash of a normalised ID number, as 64 hex characters. */
	public String hash(String normalized) {
		if (key == null) {
			throw new IllegalStateException("IDENTITY_HMAC_KEY is not set");
		}
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(key);
			return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
		} catch (java.security.GeneralSecurityException e) {
			throw new IllegalStateException("HMAC unavailable", e);
		}
	}
}
