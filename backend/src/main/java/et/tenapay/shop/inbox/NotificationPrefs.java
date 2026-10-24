package et.tenapay.shop.inbox;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** What a person wants by SMS (in-app notifications are always on). No row = everything on. */
@Entity
@Table(name = "notification_prefs")
@Getter
@Setter
@NoArgsConstructor
public class NotificationPrefs {

	@Id
	private UUID userId;

	/** Payment received, on the way, delivered, finish-paying reminder. */
	private boolean smsOrders = true;

	/** "New message from …" nudges. */
	private boolean smsChat = true;

	/** New quotes, accepted quotes, direct job requests. */
	private boolean smsJobs = true;

	private Instant updatedAt = Instant.now();
}
