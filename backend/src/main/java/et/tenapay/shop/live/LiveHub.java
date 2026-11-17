package et.tenapay.shop.live;

import java.io.IOException;
import java.time.Duration;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.extern.slf4j.Slf4j;

/**
 * Live events to the browser (Server-Sent Events), one stream per open app. An event is only a type and an id ("a new
 * message in conversation 12"); the browser then loads the content through the normal, checked REST calls, so nothing
 * private travels in the stream.
 *
 * <p>Kept in memory: this runs as one server. Each person may have at most {@link #MAX_OPEN} streams (a few tabs); the
 * oldest is closed when a new one opens. A heartbeat every 25 s keeps proxies from closing idle streams.
 */
@Slf4j
@Component
public class LiveHub {

	static final int MAX_OPEN = 3;
	private static final Duration STREAM_FOR = Duration.ofMinutes(30);

	private final Map<UUID, Deque<SseEmitter>> streams = new ConcurrentHashMap<>();

	/** Opens a stream for this person. The first event says it is connected. */
	public SseEmitter open(UUID userId) {
		SseEmitter emitter = new SseEmitter(STREAM_FOR.toMillis());
		Deque<SseEmitter> mine = streams.computeIfAbsent(userId, k -> new ConcurrentLinkedDeque<>());
		mine.addLast(emitter);
		while (mine.size() > MAX_OPEN) {
			SseEmitter oldest = mine.pollFirst();
			if (oldest != null) {
				oldest.complete();
			}
		}
		Runnable forget = () -> {
			mine.remove(emitter);
			if (mine.isEmpty()) {
				streams.remove(userId, mine);
			}
		};
		emitter.onCompletion(forget);
		emitter.onTimeout(() -> {
			forget.run();
			emitter.complete();
		});
		emitter.onError(e -> forget.run());
		send(userId, emitter, "hello", "{}", forget);
		return emitter;
	}

	/** Tells every open stream of this person about something (for example "chat" with a conversation id). */
	public void publish(UUID userId, String type, String json) {
		Deque<SseEmitter> mine = streams.get(userId);
		if (mine == null) {
			return;
		}
		for (SseEmitter emitter : mine) {
			send(userId, emitter, type, json, () -> mine.remove(emitter));
		}
	}

	@Scheduled(fixedRate = 25_000)
	void heartbeat() {
		streams.forEach((userId, mine) -> {
			for (SseEmitter emitter : mine) {
				try {
					synchronized (emitter) {
						emitter.send(SseEmitter.event().comment("ping"));
					}
				} catch (IOException | IllegalStateException gone) {
					mine.remove(emitter);
				}
			}
		});
	}

	/** Number of open streams, for tests and the admin view. */
	public int openStreams(UUID userId) {
		Deque<SseEmitter> mine = streams.get(userId);
		return mine == null ? 0 : mine.size();
	}

	private void send(UUID userId, SseEmitter emitter, String type, String json, Runnable forget) {
		try {
			synchronized (emitter) {
				emitter.send(SseEmitter.event().name(type).data(json, MediaType.APPLICATION_JSON));
			}
		} catch (IOException | IllegalStateException gone) {
			// the browser went away or the stream was already closed: forget it; the browser reconnects by itself
			forget.run();
		} catch (RuntimeException e) {
			log.debug("Live event {} for {} not sent: {}", type, userId, e.getMessage());
			forget.run();
		}
	}
}
