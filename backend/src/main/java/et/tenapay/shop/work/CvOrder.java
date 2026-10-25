package et.tenapay.shop.work;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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

/** J5: a professional CV written by our team. */
@Entity
@Table(name = "cv_orders")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class CvOrder {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	public enum Package { BASIC, COVER, PREMIUM }

	public enum Status { AWAITING_PAYMENT, PAID, WRITING, DRAFT_SENT, CHANGES, DONE, CANCELLED }

	private UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "package")
	private Package pack;

	private boolean express;

	/** EN, AM or BOTH. */
	private String language = "EN";

	private BigDecimal price;

	private int discountPercent;

	private BigDecimal total;

	@Enumerated(EnumType.STRING)
	private Status status = Status.AWAITING_PAYMENT;

	private String targetJob;

	private String details;

	private String paymentReference;

	private String writer;

	private int changesAllowed = 1;

	private int changesUsed;

	private String changeRequest;

	private Instant dueAt;

	private Instant paidAt;

	private Instant doneAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;
}
