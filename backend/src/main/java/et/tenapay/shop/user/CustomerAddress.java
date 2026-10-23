package et.tenapay.shop.user;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A delivery address saved by a signed-in customer. */
@Entity
@Table(name = "customer_addresses")
@Getter
@Setter
@NoArgsConstructor
public class CustomerAddress {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID userId;

	private String label;

	private String recipientName;

	private String phone;

	private String addressLine;

	private String city;

	private String notes;

	@Column(name = "is_default")
	private boolean defaultAddress;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
