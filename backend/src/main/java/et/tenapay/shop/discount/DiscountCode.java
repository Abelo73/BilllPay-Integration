package et.tenapay.shop.discount;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

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

@Entity
@Table(name = "discount_codes")
@Getter
@Setter
@NoArgsConstructor
public class DiscountCode {

	public enum Kind { PERCENT, FIXED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String code;

	private String description;

	@Enumerated(EnumType.STRING)
	private Kind kind;

	private BigDecimal value;

	private BigDecimal maxDiscount;

	private BigDecimal minSubtotal = BigDecimal.ZERO;

	private Instant startsAt;

	private Instant expiresAt;

	private Integer usageLimit;

	private int timesUsed;

	private boolean active = true;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	/** Why the code can't be used now for this subtotal, or null when it can. */
	public String problem(BigDecimal subtotal, Instant now) {
		if (!active) {
			return "INACTIVE";
		}
		if (startsAt != null && now.isBefore(startsAt)) {
			return "NOT_STARTED";
		}
		if (expiresAt != null && !now.isBefore(expiresAt)) {
			return "EXPIRED";
		}
		if (usageLimit != null && timesUsed >= usageLimit) {
			return "USED_UP";
		}
		if (minSubtotal != null && subtotal.compareTo(minSubtotal) < 0) {
			return "BELOW_MINIMUM";
		}
		return null;
	}

	/** Discount on the items, never more than the subtotal. */
	public BigDecimal discountFor(BigDecimal subtotal) {
		BigDecimal d = kind == Kind.PERCENT
				? subtotal.multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
				: value.setScale(2, RoundingMode.HALF_UP);
		if (kind == Kind.PERCENT && maxDiscount != null && d.compareTo(maxDiscount) > 0) {
			d = maxDiscount.setScale(2, RoundingMode.HALF_UP);
		}
		return d.min(subtotal);
	}
}
