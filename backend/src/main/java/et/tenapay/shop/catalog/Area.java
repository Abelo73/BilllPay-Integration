package et.tenapay.shop.catalog;

import java.math.BigDecimal;
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

/** An area of Sodo offered in forms and filters (Admin → Areas). Free text is still accepted. */
@Entity
@Table(name = "areas")
@Getter
@Setter
@NoArgsConstructor
public class Area {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String name;

	private int sortOrder;

	private boolean active = true;

	/** Delivery fee to this area; null = the standard fee, 0 = free. */
	private BigDecimal deliveryFee;

	/** Map point for order tracking; null = the centre of Sodo. */
	private BigDecimal lat;

	private BigDecimal lng;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
