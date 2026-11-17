package et.tenapay.shop.chat;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Who is online and who is typing, for chat only. Kept in memory: the app runs as one server, and a restart just means
 * everyone shows as offline for a minute. Nothing here is written to the database.
 */
@Component
public class ChatPresence {

	/** The app pings every 30 s while it is open, so one missed ping still counts as online. */
	static final Duration ONLINE_FOR = Duration.ofSeconds(75);
	/** Typing lasts this long after the last key press (the app sends a press at most every 2.5 s). */
	static final Duration TYPING_FOR = Duration.ofSeconds(4);

	private final Map<UUID, Instant> lastActive = new ConcurrentHashMap<>();
	private final Map<String, Instant> typing = new ConcurrentHashMap<>();

	public void touch(UUID userId) {
		lastActive.put(userId, Instant.now());
	}

	public boolean online(UUID userId) {
		Instant at = lastActive.get(userId);
		return at != null && at.isAfter(Instant.now().minus(ONLINE_FOR));
	}

	public Optional<Instant> lastActive(UUID userId) {
		return Optional.ofNullable(lastActive.get(userId));
	}

	public void typing(Long conversationId, Conversation.Side side) {
		typing.put(key(conversationId, side), Instant.now());
	}

	public boolean isTyping(Long conversationId, Conversation.Side side) {
		Instant at = typing.get(key(conversationId, side));
		return at != null && at.isAfter(Instant.now().minus(TYPING_FOR));
	}

	private static String key(Long conversationId, Conversation.Side side) {
		return conversationId + ":" + side.name();
	}
}
