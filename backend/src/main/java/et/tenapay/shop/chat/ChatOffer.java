package et.tenapay.shop.chat;

import java.math.BigDecimal;
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

/** A price for a product and quantity, made by the buyer or the seller. */
@Entity
@Table(name = "chat_offers")
@Getter
@Setter
@NoArgsConstructor
public class ChatOffer {

	public enum Status {
		PENDING, ACCEPTED, DECLINED, COUNTERED, WITHDRAWN, EXPIRED,
		/** Bought: the accepted price was used by an order. */
		USED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long conversationId;

	private Long productId;

	private int quantity = 1;

	private BigDecimal unitPrice;

	@Enumerated(EnumType.STRING)
	private Conversation.Side madeBy;

	@Enumerated(EnumType.STRING)
	private Status status = Status.PENDING;

	private Instant expiresAt;

	private Instant decidedAt;

	private String usedOrderNumber;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	/** Pending and not lapsed: the other side can still answer. */
	public boolean isOpen(Instant now) {
		return status == Status.PENDING && expiresAt.isAfter(now);
	}

	/** Accepted and still within its window: the buyer can check out at this price. */
	public boolean isBuyable(Instant now) {
		return status == Status.ACCEPTED && expiresAt.isAfter(now);
	}
}
