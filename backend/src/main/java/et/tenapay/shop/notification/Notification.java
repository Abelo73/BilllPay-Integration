package et.tenapay.shop.notification;

import java.time.Instant;

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

/** One email to a customer, and whether it went out. */
@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
public class Notification {

	public enum Status { SENDING, SENT, FAILED, SKIPPED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String kind;

	/** Same event delivered twice by Kafka → same key → one email. */
	private String dedupeKey;

	private String orderNumber;

	private String recipient;

	private String subject;

	@Enumerated(EnumType.STRING)
	private Status status;

	private String error;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	private Instant sentAt;
}
