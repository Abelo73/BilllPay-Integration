package et.tenapay.shop.catalog;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Audit row for a catalog edit: who did what to which product or category. */
@Entity
@Table(name = "catalog_changes")
@Getter
@Setter
@NoArgsConstructor
public class CatalogChange {

	public enum EntityType { PRODUCT, CATEGORY }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	private EntityType entityType;

	private Long entityId;

	private String action;

	private String detail;

	private UUID userId;

	private String userEmail;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
