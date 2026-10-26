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

/** M16: a listing on top of search and the home page for some days, once staff confirm the payment. */
@Entity
@Table(name = "boosts")
@Getter
@Setter
@NoArgsConstructor
public class Boost {

	public enum Status { REQUESTED, ACTIVE, ENDED, REJECTED, CANCELLED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long productId;

	private Long shopId;

	private int days;

	private BigDecimal price;

	@Enumerated(EnumType.STRING)
	private Status status = Status.REQUESTED;

	private String paymentReference;

	private Instant startsAt;

	private Instant endsAt;

	private String decidedBy;

	private String note;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;
}
