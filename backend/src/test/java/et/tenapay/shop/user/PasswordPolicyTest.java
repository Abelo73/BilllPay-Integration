package et.tenapay.shop.user;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.common.ApiException;

class PasswordPolicyTest {

	@Test
	void acceptsLettersAndDigitsOfEnoughLength() {
		assertThatCode(() -> PasswordPolicy.check("secret123")).doesNotThrowAnyException();
		assertThatCode(() -> PasswordPolicy.check("ብርሃን2026abc")).doesNotThrowAnyException();
	}

	@Test
	void rejectsShortOrSingleKindPasswords() {
		for (String weak : new String[] { "short1", "onlyletters", "12345678", "", null }) {
			assertThatThrownBy(() -> PasswordPolicy.check(weak)).isInstanceOf(ApiException.class);
		}
	}

	@Test
	void rejectsPasswordsOverBcryptLimit() {
		assertThatThrownBy(() -> PasswordPolicy.check("a1".repeat(40))).isInstanceOf(ApiException.class);
	}
}
