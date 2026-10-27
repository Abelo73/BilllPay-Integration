package et.tenapay.shop.favourite;

import java.math.BigDecimal;
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

/** A listing a shopper hearted. */
@Entity
@Table(name = "favourites")
@Getter
@Setter
@NoArgsConstructor
public class Favourite {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID userId;

	private Long productId;

	private BigDecimal priceWhenSaved;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;
}
