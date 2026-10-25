package et.tenapay.shop.telegram;

/** Sends Telegram Bot API calls. The test-mode gateway only records them. */
public interface TelegramGateway {

	/** One link button under a message; {@code null} = no button. */
	record Button(String text, String url) {
	}

	record Result(boolean ok, String error) {

		static Result success() {
			return new Result(true, null);
		}

		static Result failed(String error) {
			return new Result(false, error);
		}
	}

	boolean delivers();

	/** {@code html} uses Telegram's HTML mode: only b, i, a and code tags; everything else must be escaped. */
	Result sendMessage(String chatId, String html, Button button);

	Result setWebhook(String url, String secret);
}
