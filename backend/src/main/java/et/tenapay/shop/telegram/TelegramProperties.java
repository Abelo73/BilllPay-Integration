package et.tenapay.shop.telegram;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Telegram bot settings. With no bot token the bot runs in test mode: messages are logged (Admin → SMS shows the last
 * ones), never sent.
 *
 * @param token         bot token from @BotFather (secret, .env only)
 * @param botUsername   the bot's @username without the @, used for the "Connect Telegram" link
 * @param channelId     channel for new-listing posts, e.g. {@code @sodogebeya}; blank = no channel posts
 * @param webhookSecret Telegram sends it in {@code X-Telegram-Bot-Api-Secret-Token}; blank = webhook switched off
 */
@ConfigurationProperties("telegram")
public record TelegramProperties(String token, String botUsername, String channelId, String webhookSecret, String baseUrl,
		Duration timeout) {

	public boolean configured() {
		return token != null && !token.isBlank();
	}

	public boolean channelConfigured() {
		return channelId != null && !channelId.isBlank();
	}

	public String baseUrlOrDefault() {
		return baseUrl == null || baseUrl.isBlank() ? "https://api.telegram.org" : baseUrl.replaceAll("/+$", "");
	}

	public Duration timeoutOrDefault() {
		return timeout == null ? Duration.ofSeconds(10) : timeout;
	}
}
