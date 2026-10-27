package et.tenapay.shop.dispute;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.UpdateTimestamp;

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

/** A buyer's problem with one parcel (M8). While OPEN, the parcel's money stays held. */
@Entity
@Table(name = "disputes")
@Getter
@Setter
@NoArgsConstructor
public class Dispute {

	public enum Reason { NOT_RECEIVED, NOT_AS_DESCRIBED, DAMAGED, WRONG_ITEM, MISSING_ITEMS, OTHER }

	public enum Status {
		OPEN,
		/** the buyer got the parcel's money back */
		REFUNDED,
		/** the buyer got part back; the seller is paid the rest */
		PART_REFUNDED,
		/** no refund: the seller is paid */
		SELLER_PAID,
		/** the buyer closed it (sorted out with the seller) */
		WITHDRAWN;

		public boolean open() {
			return this == OPEN;
		}
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID orderId;

	private Long parcelId;

	/** null = sold by Sodo Gebeya itself */
	private Long shopId;

	private UUID buyerId;

	@Enumerated(EnumType.STRING)
	private Reason reason;

	private String details;

	@Enumerated(EnumType.STRING)
	private Status status = Status.OPEN;

	private BigDecimal refundAmount;

	private String decisionNote;

	private String decidedBy;

	private Instant sellerRepliedAt;

	/** A part refund the seller offered; the buyer accepts it (settled) or declines it (staff decide). */
	private BigDecimal sellerOfferAmount;

	private Instant sellerOfferAt;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	private Instant resolvedAt;

	@UpdateTimestamp
	private Instant updatedAt;
}
