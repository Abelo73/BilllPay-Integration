package et.tenapay.shop.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

/** A skilled worker's public profile (design S8). Staff approve it before it shows. */
@Entity
@Table(name = "pro_profiles")
@Getter
@Setter
@NoArgsConstructor
public class ProProfile {

	public enum Trade { ELECTRICIAN, PLUMBER, CARPENTER, TAILOR, PAINTER, PHONE_REPAIR, TUTOR, MECHANIC, CLEANING, OTHER }

	public enum Status {
		PENDING, APPROVED, REJECTED, SUSPENDED;

		public boolean listed() {
			return this == APPROVED;
		}
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID ownerId;

	private String displayName;

	@Enumerated(EnumType.STRING)
	private Trade trade;

	private String headline;

	private String bio;

	private Integer yearsExperience;

	private String areas;

	/** Shared with a customer only after they accept this pro's quote. */
	private String phone;

	private String avatarKey;

	@Enumerated(EnumType.STRING)
	private Status status = Status.PENDING;

	private String statusNote;

	private Instant decidedAt;

	private String decidedBy;

	private int jobsDone;

	private int ratingSum;

	private int ratingCount;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	public BigDecimal rating() {
		return ratingCount == 0 ? null
				: BigDecimal.valueOf(ratingSum).divide(BigDecimal.valueOf(ratingCount), 1, RoundingMode.HALF_UP);
	}
}
