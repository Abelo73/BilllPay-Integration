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
@Table(name = "chat_messages")
@Getter
@Setter
@NoArgsConstructor
public class ChatMessage {

	public enum Kind { TEXT, IMAGE, OFFER, SYSTEM }

	public enum SenderRole { BUYER, SELLER, SYSTEM }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long conversationId;

	private UUID senderId;

	@Enumerated(EnumType.STRING)
	private SenderRole senderRole;

	@Enumerated(EnumType.STRING)
	private Kind kind;

	private String body;

	private String imageKey;

	private Long offerId;

	/** Looks like an attempt to deal off the platform; shown with a safety warning. */
	private boolean flagged;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
