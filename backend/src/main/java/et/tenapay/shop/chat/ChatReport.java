package et.tenapay.shop.chat;

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

@Entity
@Table(name = "chat_reports")
@Getter
@Setter
@NoArgsConstructor
public class ChatReport {

	public enum Reason { SCAM, OFF_PLATFORM_PAYMENT, ABUSE, SPAM, OTHER }

	public enum Status { OPEN, RESOLVED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long conversationId;

	private UUID reporterId;

	@Enumerated(EnumType.STRING)
	private Reason reason;

	private String details;

	@Enumerated(EnumType.STRING)
	private Status status = Status.OPEN;

	private String resolution;

	private String resolvedBy;

	private Instant resolvedAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
