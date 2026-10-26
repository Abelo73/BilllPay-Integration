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

/** A partner rider who delivers parcels in Sodo (M21). Staff keep the list in Admin → Riders. */
@Entity
@Table(name = "riders")
@Getter
@Setter
@NoArgsConstructor
public class Rider {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String name;

	/** +2519XXXXXXXX / +2517XXXXXXXX; shown to the buyer once their parcel is on the way. */
	private String phone;

	/** Staff note, e.g. "Bajaj, mornings only". */
	private String note;

	private boolean active = true;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
