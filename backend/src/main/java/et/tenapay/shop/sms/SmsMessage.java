package et.tenapay.shop.sms;

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

/** One SMS the shop sent, or tried to. Sign-in codes are stored masked. */
@Entity
@Table(name = "sms_messages")
@Getter
@Setter
@NoArgsConstructor
public class SmsMessage {

	/** SENDING: claimed by one Kafka delivery, provider call in flight. */
	public enum Status { SENDING, SENT, FAILED, LOGGED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String kind;

	private String recipient;

	private String body;

	private String provider;

	@Enumerated(EnumType.STRING)
	private Status status;

	private String providerRef;

	private String error;

	private String orderNumber;

	/** One per event (e.g. "PAID:TS-...:2026-10-24T10:00:00Z"); null for messages that may repeat, like codes. */
	private String dedupeKey;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
