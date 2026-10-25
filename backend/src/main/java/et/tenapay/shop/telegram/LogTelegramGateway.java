package et.tenapay.shop.telegram;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

/** Test mode: keeps the last 200 messages in memory and in the log. */
@Slf4j
public class LogTelegramGateway implements TelegramGateway {

	public record Sent(String chatId, String html, Button button, Instant at) {
	}

	private final Deque<Sent> sent = new ArrayDeque<>();

	@Override
	public boolean delivers() {
		return false;
	}

	@Override
	public synchronized Result sendMessage(String chatId, String html, Button button) {
		log.info("Telegram (test mode) to {}: {}", chatId, html.replace('\n', ' '));
		sent.addFirst(new Sent(chatId, html, button, Instant.now()));
		while (sent.size() > 200) {
			sent.removeLast();
		}
		return Result.success();
	}

	@Override
	public Result setWebhook(String url, String secret) {
		log.info("Telegram (test mode): webhook would be {}", url);
		return Result.success();
	}

	public synchronized List<Sent> sent() {
		return List.copyOf(sent);
	}
}
