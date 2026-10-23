package et.tenapay.shop.admin;

import java.time.Instant;

import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.notification.Notification;
import et.tenapay.shop.notification.NotificationRepository;
import lombok.RequiredArgsConstructor;

/** Admin: the log of customer emails. */
@RestController
@RequestMapping("/api/admin/notifications")
@RequiredArgsConstructor
public class NotificationAdminController {

	private final NotificationRepository notifications;
	private final AppProperties app;

	public record NotificationRow(Long id, String kind, String orderNumber, String recipient, String subject,
			String status, String error, Instant createdAt, Instant sentAt) {

		public static NotificationRow of(Notification n) {
			return new NotificationRow(n.getId(), n.getKind(), n.getOrderNumber(), n.getRecipient(), n.getSubject(),
					n.getStatus().name(), n.getError(), n.getCreatedAt(), n.getSentAt());
		}
	}

	/** {@code mailboxUrl} is the dev inbox (Mailpit) when configured. */
	public record NotificationsView(PageDto<NotificationRow> page, String mailboxUrl) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public NotificationsView list(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String inbox = app.mail().inboxUrl();
		return new NotificationsView(
				PageDto.of(notifications.findAllByOrderByCreatedAtDesc(PageRequest.of(page, Math.min(size, 100)))
						.map(NotificationRow::of)),
				inbox == null || inbox.isBlank() ? null : inbox);
	}
}
