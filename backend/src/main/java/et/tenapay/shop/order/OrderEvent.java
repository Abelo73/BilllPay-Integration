package et.tenapay.shop.order;

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

/** One row of an order's timeline. */
@Entity
@Table(name = "order_events")
@Getter
@Setter
@NoArgsConstructor
public class OrderEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID orderId;

	private String type;

	@Enumerated(EnumType.STRING)
	private OrderStatus fromStatus;

	@Enumerated(EnumType.STRING)
	private OrderStatus toStatus;

	private String detail;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	public OrderEvent(UUID orderId, String type, OrderStatus from, OrderStatus to, String detail) {
		this.orderId = orderId;
		this.type = type;
		this.fromStatus = from;
		this.toStatus = to;
		this.detail = detail;
	}
}
