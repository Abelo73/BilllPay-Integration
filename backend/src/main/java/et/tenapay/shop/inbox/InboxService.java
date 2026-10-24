package et.tenapay.shop.inbox;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.PageDto;
import lombok.extern.slf4j.Slf4j;

/**
 * In-app notifications (design S15) and SMS preferences. Other features call {@link #notify}; a dedupe key makes
 * re-delivered events show once. Items older than 90 days are cleaned up.
 */
@Slf4j
@Service
public class InboxService {

	public static final Duration KEEP = Duration.ofDays(90);

	public enum SmsTopic { ORDERS, CHAT, JOBS }

	private final InboxRepository items;
	private final NotificationPrefsRepository prefs;
	private final TransactionTemplate tx;
	private final ApplicationEventPublisher events;

	public InboxService(InboxRepository items, NotificationPrefsRepository prefs, TransactionTemplate tx,
			ApplicationEventPublisher events) {
		this.items = items;
		this.prefs = prefs;
		this.tx = tx;
		this.events = events;
	}

	public record ItemView(Long id, String kind, String title, String body, String link, boolean read, Instant createdAt) {
	}

	public record Inbox(PageDto<ItemView> items, long unread) {
	}

	public record Prefs(boolean smsOrders, boolean smsChat, boolean smsJobs) {
	}

	/** Adds a notification; does nothing when {@code dedupeKey} was already used. Never throws. */
	public void notify(UUID userId, InboxItem.Kind kind, String title, String body, String link, String dedupeKey) {
		if (userId == null) {
			return;
		}
		try {
			if (dedupeKey != null && items.existsByDedupeKey(dedupeKey)) {
				return;
			}
			InboxItem i = new InboxItem();
			i.setUserId(userId);
			i.setKind(kind);
			i.setTitle(cut(title, 160));
			i.setBody(cut(body, 500));
			i.setLink(link != null && link.startsWith("/") && !link.startsWith("//") ? cut(link, 300) : null);
			i.setDedupeKey(dedupeKey == null ? null : cut(dedupeKey, 200));
			items.save(i);
			events.publishEvent(new InboxItemAdded(userId, kind, i.getTitle(), i.getBody(), i.getLink()));
		} catch (DataIntegrityViolationException duplicate) {
			log.debug("Inbox {} already there", dedupeKey);
		} catch (RuntimeException e) {
			log.warn("Could not add notification for {}: {}", userId, e.getMessage());
		}
	}

	public Inbox list(UUID userId, int page) {
		return tx.execute(s -> new Inbox(PageDto.of(items.findByUserIdOrderByCreatedAtDescIdDesc(userId, PageRequest.of(page, 30))
				.map(i -> new ItemView(i.getId(), i.getKind().name(), i.getTitle(), i.getBody(), i.getLink(), i.getReadAt() != null,
						i.getCreatedAt()))), items.countByUserIdAndReadAtIsNull(userId)));
	}

	public long unread(UUID userId) {
		return items.countByUserIdAndReadAtIsNull(userId);
	}

	public void markRead(UUID userId, Long id) {
		tx.executeWithoutResult(s -> {
			if (id == null) {
				items.markAllRead(userId, Instant.now());
			} else {
				items.markRead(userId, id, Instant.now());
			}
		});
	}

	public Prefs prefs(UUID userId) {
		NotificationPrefs p = prefs.findById(userId).orElseGet(NotificationPrefs::new);
		return new Prefs(p.isSmsOrders(), p.isSmsChat(), p.isSmsJobs());
	}

	public Prefs savePrefs(UUID userId, Prefs in) {
		return tx.execute(s -> {
			NotificationPrefs p = prefs.findById(userId).orElseGet(() -> {
				NotificationPrefs n = new NotificationPrefs();
				n.setUserId(userId);
				return n;
			});
			p.setSmsOrders(in.smsOrders());
			p.setSmsChat(in.smsChat());
			p.setSmsJobs(in.smsJobs());
			p.setUpdatedAt(Instant.now());
			prefs.save(p);
			return new Prefs(p.isSmsOrders(), p.isSmsChat(), p.isSmsJobs());
		});
	}

	/** Whether this person accepts SMS about the topic (no preferences saved = yes). */
	public boolean wantsSms(UUID userId, SmsTopic topic) {
		if (userId == null) {
			return true;
		}
		return prefs.findById(userId).map(p -> switch (topic) {
			case ORDERS -> p.isSmsOrders();
			case CHAT -> p.isSmsChat();
			case JOBS -> p.isSmsJobs();
		}).orElse(true);
	}

	/** Housekeeping, called by the daily cleanup. */
	public int cleanUp() {
		Integer n = tx.execute(s -> items.deleteOlderThan(Instant.now().minus(KEEP)));
		return n == null ? 0 : n;
	}

	private static String cut(String s, int max) {
		if (s == null) {
			return null;
		}
		return s.length() > max ? s.substring(0, max - 1) + "…" : s;
	}
}
