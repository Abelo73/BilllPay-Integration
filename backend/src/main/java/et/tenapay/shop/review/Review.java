package et.tenapay.shop.review;

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

/** A verified buyer's review of one bought item. */
@Entity
@Table(name = "reviews")
@Getter
@Setter
@NoArgsConstructor
public class Review {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID orderId;

	private Long orderItemId;

	private Long productId;

	/** Null when the item was sold by Sodo Gebeya itself. */
	private Long shopId;

	private UUID authorId;

	/** Shown publicly, e.g. "Hana G.". */
	private String authorName;

	private short rating;

	private String body;

	private String sellerReply;

	private Instant repliedAt;

	private boolean hidden;

	private String hiddenReason;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
