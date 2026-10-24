package et.tenapay.shop.inbox;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One in-app notification (design S15), e.g. "Your order is on the way". */
@Entity
@Table(name = "inbox_items")
@Getter
@Setter
@NoArgsConstructor
public class InboxItem {

	/** Decides the icon in the app. */
	public enum Kind { ORDER, PAYMENT, DELIVERY, CHAT, JOB, SHOP, REVIEW, SYSTEM }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID userId;

	@Enumerated(EnumType.STRING)
	private Kind kind;

	private String title;

	private String body;

	/** Where tapping it goes, e.g. "/orders/track?order=TS-…". Always a path inside the shop. */
	private String link;

	/** One per event, so a re-delivered event never shows twice. */
	private String dedupeKey;

	private Instant readAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
