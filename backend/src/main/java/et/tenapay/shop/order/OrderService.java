package et.tenapay.shop.order;

import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.events.OrderEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Order state changes and their side effects. Callers must hold a transaction. */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

	private final OrderEventRepository events;
	private final ProductRepository products;
	private final OrderEventPublisher publisher;
	private final et.tenapay.shop.monitoring.ShopMetrics metrics;
	private final et.tenapay.shop.discount.DiscountService discounts;

	public void transition(Order order, OrderStatus to, String eventType, String detail) {
		OrderStatus from = order.getStatus();
		order.setStatus(to);
		events.save(new OrderEvent(order.getId(), eventType, from, to, detail));
		log.info("Order {} {} -> {} ({})", order.getOrderNumber(), from, to, eventType);
		metrics.orderStatus(to.name());
		Map<String, Object> extra = new HashMap<>();
		if (detail != null) {
			extra.put("detail", detail);
		}
		publisher.publish(order, "order." + eventType.toLowerCase().replace('_', '.'), extra);
	}

	/** Timeline entry without a status change. */
	public void note(Order order, String eventType, String detail) {
		events.save(new OrderEvent(order.getId(), eventType, order.getStatus(), order.getStatus(), detail));
	}

	/** An unpaid order ended (cancelled or expired): its stock and discount-code use go back. */
	public void releaseReservations(Order order) {
		discounts.release(order.getDiscountCode());
		forEachProduct(order, products::releaseReserved);
	}

	public void commitStock(Order order) {
		forEachProduct(order, products::commitReserved);
	}

	/** One single-statement stock update per product, in ascending id order (no lock waits in a circle). */
	private void forEachProduct(Order order, java.util.function.ToIntBiFunction<Long, Integer> update) {
		Map<Long, Integer> qty = new java.util.TreeMap<>();
		for (OrderItem item : order.getItems()) {
			qty.merge(item.getProductId(), item.getQuantity(), Integer::sum);
		}
		qty.forEach(update::applyAsInt);
	}
}
