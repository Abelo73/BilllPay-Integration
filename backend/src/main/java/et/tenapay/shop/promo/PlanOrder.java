package et.tenapay.shop.promo;

import java.math.BigDecimal;
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
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** M17: a shop asks for (or renews) the Pro plan for some months; staff confirm the payment. */
@Entity
@Table(name = "plan_orders")
@Getter
@Setter
@NoArgsConstructor
public class PlanOrder {

	public enum Status { REQUESTED, PAID, REJECTED, CANCELLED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long shopId;

	private int months;

	private BigDecimal price;

	@Enumerated(EnumType.STRING)
	private Status status = Status.REQUESTED;

	private String paymentReference;

	private String decidedBy;

	private String note;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;
}
