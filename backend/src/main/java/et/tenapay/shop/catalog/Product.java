package et.tenapay.shop.catalog;

import java.math.BigDecimal;
import java.time.Instant;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
public class Product {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "category_id")
	private Category category;

	/** Who sells it; null = Sodo Gebeya itself. Shown in the store only while the shop is approved. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "shop_id")
	private et.tenapay.shop.seller.Shop shop;

	private String name;

	private String slug;

	private String description;

	private BigDecimal price;

	private String currency;

	private int stock;

	/** Units held by unpaid orders; available = stock - reserved. */
	private int reserved;

	/** Main photo URL, kept in sync with the first product_images row (or a seeded /products/*.jpg). */
	private String imageUrl;

	/** At or below this many available units the store shows "only N left". */
	private int lowStockThreshold = 5;

	private boolean featured;

	private boolean active;

	/** NEW, LIKE_NEW or USED; null = new goods from a shop. */
	@jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
	@jakarta.persistence.Column(name = "item_condition")
	private ItemCondition condition;

	/** The seller is open to offers on the price. */
	private boolean negotiable;

	/** Where the item is; null = the shop's area. */
	private String area;

	/** Answers to the category's detail fields as JSON, e.g. {"brand":"Samsung","ram":"8 GB"} (see SpecsService). */
	@Column(columnDefinition = "jsonb", nullable = false)
	@org.hibernate.annotations.ColumnTransformer(write = "?::jsonb")
	private String specs = "{}";

	/** M16: on top of search and the home page until then (a paid boost). */
	private Instant boostedUntil;

	public boolean boosted() {
		return boostedUntil != null && boostedUntil.isAfter(Instant.now());
	}

	/** Set when staff took the listing down after reports; it stays off the store until staff lift it. */
	private String blockedReason;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	/** Shown and buyable: switched on, not taken down by staff, and its seller (if any) approved. */
	public boolean sellable() {
		return active && blockedReason == null && (shop == null || shop.getStatus().selling());
	}

	/** The item's area, else its shop's. */
	public String effectiveArea() {
		return area != null ? area : shop != null ? shop.getArea() : null;
	}

	public int available() {
		return stock - reserved;
	}

	public boolean lowStock() {
		return available() > 0 && available() <= lowStockThreshold;
	}

	public void reserve(int qty) {
		if (available() < qty) {
			throw new IllegalStateException("Insufficient stock for " + slug);
		}
		reserved += qty;
	}

	public void releaseReservation(int qty) {
		reserved = Math.max(0, reserved - qty);
	}

	/** Turns a reservation into a sale once the order is paid. */
	public void commitReservation(int qty) {
		releaseReservation(qty);
		stock = Math.max(0, stock - qty);
	}
}
