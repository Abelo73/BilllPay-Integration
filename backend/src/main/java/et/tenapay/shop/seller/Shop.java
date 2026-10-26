package et.tenapay.shop.seller;

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

/** A seller on the marketplace: one per customer account. */
@Entity
@Table(name = "shops")
@Getter
@Setter
@NoArgsConstructor
public class Shop {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID ownerId;

	@Enumerated(EnumType.STRING)
	private ShopKind kind;

	private String name;

	private String slug;

	private String description;

	private String phone;

	private String area;

	private String addressLine;

	private String logoKey;

	private String coverKey;

	@Enumerated(EnumType.STRING)
	private ShopStatus status = ShopStatus.PENDING;

	private String statusNote;

	private Instant decidedAt;

	private String decidedBy;

	/** Set when staff approved the owner's ID (Verified badge); null = not verified. */
	private Instant verifiedAt;

	/** M17: FREE or PRO; PRO counts only while {@link #planUntil} is in the future (see {@link #pro()}). */
	private String plan = "FREE";

	private Instant planUntil;

	/** The last "your Pro plan ends soon" SMS. */
	private Instant planRemindedAt;

	/** The Pro plan is paid up (M17): no product limit, Pro badge, statistics, lower commission. */
	public boolean pro() {
		return "PRO".equals(plan) && planUntil != null && planUntil.isAfter(Instant.now());
	}

	/** Where payouts go: BANK, TELEBIRR, CBE_BIRR or OTHER. */
	private String payoutMethod;

	/** Bank name, for BANK. */
	private String payoutProvider;

	private String payoutAccountName;

	private String payoutAccount;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;
}
