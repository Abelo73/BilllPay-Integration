package et.tenapay.shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "categories")
@Getter
@Setter
@NoArgsConstructor
public class Category {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String name;

	private String slug;

	private int sortOrder;

	/** The main category this one sits under (Electronics for "Mobile phones"); null = a main category. */
	@jakarta.persistence.Column(name = "parent_id")
	private Long parentId;

	/** Hidden categories (and their products) are not shown in the store. */
	private boolean active = true;
}
