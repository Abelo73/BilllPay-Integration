package et.tenapay.shop.order;

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
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One seller's part of an order (M5). The buyer pays once for the whole order; each parcel is packed and delivered
 * by its seller (shopId null = Sodo Gebeya) with its own delivery fee and steps. Shown as {@code <order>-<parcelNo>}.
 */
@Entity
@Table(name = "order_parcels")
@Getter
@Setter
@NoArgsConstructor
public class OrderParcel {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID orderId;

	private int parcelNo;

	private Long shopId;

	private BigDecimal itemsTotal;

	/** The part of the order's discount carried by this parcel (spread by item value). */
	private BigDecimal discountShare = BigDecimal.ZERO;

	private BigDecimal deliveryFee = BigDecimal.ZERO;

	/** Null until the order is paid. */
	@Enumerated(EnumType.STRING)
	private FulfilmentStatus fulfilmentStatus;

	private String trackingNote;

	/** Partner rider bringing this parcel (M21), set by staff. */
	private Long riderId;

	private Instant riderAssignedAt;

	private Instant shippedAt;

	private Instant deliveredAt;

	private Instant cancelledAt;

	/** Seller's money for this parcel: held until the buyer confirms receipt or 48 h after delivery. Null for unpaid
	 * orders and for Sodo Gebeya's own parcels. */
	@Enumerated(EnumType.STRING)
	private et.tenapay.shop.payout.EarningStatus payoutStatus;

	/** Commission locked when the order was paid. */
	private BigDecimal commissionPercent;

	private BigDecimal commissionAmount;

	/** What the seller gets: items + delivery fee - commission (discount codes are paid by Sodo Gebeya). */
	private BigDecimal sellerAmount;

	/** The buyer tapped "I received my items". */
	private Instant receivedAt;

	private Instant releasedAt;

	/** Cash orders (M7): when the seller marked "cash received" for this parcel. */
	private Instant cashCollectedAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	public String number(String orderNumber) {
		return orderNumber + "-" + parcelNo;
	}
}
