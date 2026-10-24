package et.tenapay.shop.catalog;

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

/** A shopper's report of a listing. Staff hide the listing or dismiss the report. */
@Entity
@Table(name = "listing_reports")
@Getter
@Setter
@NoArgsConstructor
public class ListingReport {

	public enum Reason { SCAM, FAKE, PROHIBITED, WRONG_INFO, OFFENSIVE, OTHER }

	public enum Status { OPEN, HIDDEN, DISMISSED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long productId;

	private UUID reporterId;

	@Enumerated(EnumType.STRING)
	private Reason reason;

	private String details;

	@Enumerated(EnumType.STRING)
	private Status status = Status.OPEN;

	private Instant decidedAt;

	private String decidedBy;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
