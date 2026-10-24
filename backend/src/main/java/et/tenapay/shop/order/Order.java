package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
public class Order {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	private String orderNumber;

	@Enumerated(EnumType.STRING)
	private OrderStatus status;

	private BigDecimal subtotal;

	private BigDecimal total;

	private String currency;

	private String customerName;

	private String customerPhone;

	private String customerEmail;

	/** Signed-in customer who placed the order; null for guest checkout. */
	private UUID userId;

	private Instant paidAt;

	private String deliveryAddress;

	private String deliveryCity;

	private String deliveryNotes;

	/** Included in {@link #total}; total = subtotal - discountAmount + deliveryFee. */
	private BigDecimal deliveryFee = BigDecimal.ZERO;

	private String discountCode;

	private BigDecimal discountAmount = BigDecimal.ZERO;

	/** Null until the order is paid. */
	@Enumerated(EnumType.STRING)
	private FulfilmentStatus fulfilmentStatus;

	private String trackingNote;

	private Instant shippedAt;

	private Instant deliveredAt;

	private Instant cancelledAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<OrderItem> items = new ArrayList<>();

	public void addItem(OrderItem item) {
		item.setOrder(this);
		items.add(item);
	}
}
