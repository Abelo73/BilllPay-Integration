package et.tenapay.shop.delivery;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A rider's personal link to share their location for one parcel. Only the hash of its secret is kept. */
@Entity
@Table(name = "rider_share_links")
@Getter
@Setter
@NoArgsConstructor
public class RiderShareLink {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "parcel_id", nullable = false)
	private Long parcelId;

	@Column(name = "rider_id", nullable = false)
	private Long riderId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;
}
