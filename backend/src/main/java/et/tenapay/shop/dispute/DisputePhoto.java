package et.tenapay.shop.dispute;

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

/** A photo of the problem; stored privately, opened only by the buyer, the seller and staff. */
@Entity
@Table(name = "dispute_photos")
@Getter
@Setter
@NoArgsConstructor
public class DisputePhoto {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long disputeId;

	private String storageKey;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;
}
