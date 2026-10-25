package et.tenapay.shop.payout;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Commission percent for a seller, a category, both, or neither (the default). The most specific rule wins. */
@Entity
@Table(name = "commission_rules")
@Getter
@Setter
@NoArgsConstructor
public class CommissionRule {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long shopId;

	private Long categoryId;

	private BigDecimal percent;

	private String note;

	private String updatedBy;

	private Instant updatedAt = Instant.now();
}
