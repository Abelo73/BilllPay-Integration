package et.tenapay.shop.user;

import org.springframework.http.HttpStatus;

import et.tenapay.shop.common.ApiException;

public final class PasswordPolicy {

	public static final int MIN_LENGTH = 8;

	private PasswordPolicy() {
	}

	/** At least 8 characters with a letter and a digit; at most 72 bytes (BCrypt's limit). */
	public static void check(String password) {
		boolean ok = password != null && password.length() >= MIN_LENGTH
				&& password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72
				&& password.chars().anyMatch(Character::isLetter)
				&& password.chars().anyMatch(Character::isDigit);
		if (!ok) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD",
					"Use at least 8 characters, including a letter and a number.");
		}
	}
}
