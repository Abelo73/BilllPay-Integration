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

/** A buyer talking to one shop. productId is the item the conversation is currently about. */
@Entity
@Table(name = "conversations")
@Getter
@Setter
@NoArgsConstructor
public class Conversation {

	public enum Side { BUYER, SELLER }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID buyerId;

	private Long shopId;

	private Long productId;

	private Instant lastMessageAt = Instant.now();

	private String lastMessagePreview;

	private Instant buyerLastReadAt;

	private Instant sellerLastReadAt;

	/** The side that blocked the other; null when both can write. */
	@Enumerated(EnumType.STRING)
	private Side blockedBy;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	public Instant lastReadAt(Side side) {
		return side == Side.BUYER ? buyerLastReadAt : sellerLastReadAt;
	}

	public void markRead(Side side, Instant at) {
		if (side == Side.BUYER) {
			buyerLastReadAt = at;
		} else {
			sellerLastReadAt = at;
		}
	}
}
