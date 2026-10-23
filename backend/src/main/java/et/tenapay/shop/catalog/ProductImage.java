package et.tenapay.shop.catalog;

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

/** One photo of a product; position 0 is the main photo. */
@Entity
@Table(name = "product_images")
@Getter
@Setter
@NoArgsConstructor
public class ProductImage {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long productId;

	private int position;

	private String largeKey;

	private String thumbKey;

	private Integer width;

	private Integer height;

	private Integer sizeBytes;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
