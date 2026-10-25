package et.tenapay.shop.order;

import java.math.BigDecimal;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "order_items")
@Getter
@Setter
@NoArgsConstructor
public class OrderItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id")
	private Order order;

	private Long productId;

	/** Seller of this line at checkout; null = Sodo Gebeya itself. */
	private Long shopId;

	/** Which of the order's parcels this line travels in (one parcel per seller). */
	private Integer parcelNo;

	private String productName;

	private BigDecimal unitPrice;

	private int quantity;

	private BigDecimal lineTotal;
}
