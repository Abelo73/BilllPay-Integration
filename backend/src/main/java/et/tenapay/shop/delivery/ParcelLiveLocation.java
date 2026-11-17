package et.tenapay.shop.delivery;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The latest point a rider shared for a parcel. Overwritten at each update; never a history. */
@Entity
@Table(name = "parcel_live_location")
@Getter
@Setter
@NoArgsConstructor
public class ParcelLiveLocation {

	@Id
	@Column(name = "parcel_id")
	private Long parcelId;

	@Column(name = "latitude", nullable = false, precision = 9, scale = 6)
	private BigDecimal latitude;

	@Column(name = "longitude", nullable = false, precision = 9, scale = 6)
	private BigDecimal longitude;

	/** CAR or WALK */
	@Column(name = "travel_mode", nullable = false, length = 4)
	private String travelMode;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();
}
