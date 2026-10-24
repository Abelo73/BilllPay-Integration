package et.tenapay.shop.sms;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * SMS settings. With no AfroMessage token the shop runs in test mode: messages are logged and stored, never sent.
 *
 * @param devCodesInResponse local development only: return sign-in codes in the API response while in test mode, so
 *                           you can sign in without a phone. Ignored whenever a real provider is configured.
 */
@ConfigurationProperties("sms")
public record SmsProperties(AfroMessage afromessage, Duration timeout, boolean devCodesInResponse) {

	public record AfroMessage(String baseUrl, String token, String identifierId, String sender, String callback) {
	}

	public boolean afroMessageConfigured() {
		return afromessage != null && afromessage.token() != null && !afromessage.token().isBlank();
	}

	public Duration timeoutOrDefault() {
		return timeout == null ? Duration.ofSeconds(10) : timeout;
	}
}
