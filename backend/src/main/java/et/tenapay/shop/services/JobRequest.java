package et.tenapay.shop.services;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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

/** A customer's job (design S9): pros of the trade send quotes; the customer accepts one. */
@Entity
@Table(name = "job_requests")
@Getter
@Setter
@NoArgsConstructor
public class JobRequest {

	public enum Timing { TODAY, TOMORROW, THIS_WEEK, DATE }

	public enum Status { OPEN, ASSIGNED, DONE, CANCELLED, EXPIRED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID customerId;

	@Enumerated(EnumType.STRING)
	private ProProfile.Trade trade;

	private String description;

	private String area;

	@Enumerated(EnumType.STRING)
	private Timing timing;

	private LocalDate preferredDate;

	private BigDecimal budget;

	/** Asked from a pro's profile: only that pro sees it. */
	private Long directProId;

	@Enumerated(EnumType.STRING)
	private Status status = Status.OPEN;

	private Long acceptedQuoteId;

	private Short rating;

	private String review;

	private Instant completedAt;

	private Instant expiresAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	public boolean isOpen(Instant now) {
		return status == Status.OPEN && expiresAt.isAfter(now);
	}
}
