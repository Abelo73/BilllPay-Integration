package et.tenapay.shop.catalog;

import java.time.Instant;

import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.UpdateTimestamp;

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

/** One detail a category asks sellers for: Brand, Model, RAM, Storage, Chip, Bed size, ... (Admin → Categories). */
@Entity
@Table(name = "category_fields")
@Getter
@Setter
@NoArgsConstructor
public class CategoryField {

	public enum Type {
		/** one value from the list */
		SELECT,
		/** several values from the list */
		MULTI,
		NUMBER,
		TEXT,
		YES_NO
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long categoryId;

	/** Stable name in the product's specs, e.g. "ram"; never shown to people. */
	@Column(name = "field_key")
	private String key;

	private String label;

	@Enumerated(EnumType.STRING)
	private Type type;

	/** "GB", "inch", "mAh", "cm": shown after numbers. */
	private String unit;

	/** JSON: a list, or with {@link #dependsOn} a map from the parent field's value to its list (brand → models). */
	@Column(columnDefinition = "jsonb")
	@ColumnTransformer(write = "?::jsonb")
	private String options;

	/** Key of the field whose answer picks this field's list (model depends on brand). */
	private String dependsOn;

	/** Sellers may type a value that isn't in the list ("Other"). */
	private boolean allowOther;

	private boolean required;

	/** Shoppers can filter by it on the shop page. */
	private boolean filterable;

	private int position;

	private boolean active = true;

	private String help;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;
}
