package et.tenapay.shop.search;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** M9: a shopper's saved search; new listings that match are sent to them (inbox, Telegram, SMS). */
@Entity
@Table(name = "saved_searches")
@Getter
@Setter
@NoArgsConstructor
public class SavedSearch {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID userId;

	private String name;

	private String q;

	private String categorySlug;

	/** The detail filters as JSON, e.g. {"brand":"Samsung"}. */
	@Column(columnDefinition = "jsonb", nullable = false)
	@ColumnTransformer(write = "?::jsonb")
	private String specs = "{}";

	private BigDecimal minPrice;

	private BigDecimal maxPrice;

	private boolean alertInbox = true;

	private boolean alertSms;

	private long lastSeenProductId;

	private Instant lastAlertAt;

	private Instant lastSmsAt;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;
}
