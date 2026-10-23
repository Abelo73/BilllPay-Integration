package et.tenapay.shop.order;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.events.OrderEventPublisher;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Delivery progress of paid orders, and cancelling orders that were never paid. */
@Slf4j
@Service
@RequiredArgsConstructor
public class FulfilmentService {

	private final OrderRepository orders;
	private final OrderService orderService;
	private final PaymentAttemptRepository attempts;
	private final OrderEventPublisher publisher;
	private final OrderEventRepository events;

	/**
	 * Cancels an order that hasn't been paid and releases its stock. BillPay's open checkout link is left to expire;
	 * if the shopper still pays on it, the order goes to REVIEW_REQUIRED (late payment) for a refund.
	 */
	@Transactional
	public Order cancelUnpaid(String orderNumber, String reason, String by) {
		Order order = lock(orderNumber);
		if (!order.getStatus().awaitingPayment()) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_CANCELLABLE",
					order.getStatus() == OrderStatus.CANCELLED ? "This order is already cancelled."
							: "Only unpaid orders can be cancelled here (this one is " + label(order.getStatus()) + ").");
		}
		for (PaymentAttempt a : attempts.findByOrderIdOrderByAttemptNoAsc(order.getId())) {
			if (!a.getStatus().isFinal()) {
				a.setStatus(PaymentStatus.CANCELLED);
			}
		}
		orderService.releaseStock(order);
		order.setCancelledAt(Instant.now());
		orderService.transition(order, OrderStatus.CANCELLED, "CANCELLED",
				"by " + by + (reason == null || reason.isBlank() ? "" : ": " + reason.trim()));
		return order;
	}

	/** Moves a paid order's delivery forward (or cancels it before it ships). */
	@Transactional
	public Order advance(String orderNumber, FulfilmentStatus to, String note, String by) {
		Order order = lock(orderNumber);
		FulfilmentStatus from = order.getFulfilmentStatus();
		if (from == null) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAID",
					"Only paid orders can be fulfilled (this one is " + label(order.getStatus()) + ").");
		}
		if (!from.next().contains(to)) {
			throw new ApiException(HttpStatus.CONFLICT, "INVALID_FULFILMENT_STEP",
					"Can't go from " + label(from) + " to " + label(to) + ".",
					Map.of("from", from.name(), "allowed", from.next().stream().map(Enum::name).toList()));
		}
		String text = note == null || note.isBlank() ? null : note.trim();
		order.setFulfilmentStatus(to);
		Instant now = Instant.now();
		switch (to) {
			case SHIPPED -> {
				order.setShippedAt(now);
				order.setTrackingNote(text);
			}
			case DELIVERED -> order.setDeliveredAt(now);
			case CANCELLED -> order.setCancelledAt(now);
			default -> {
			}
		}
		String detail = label(from) + " → " + label(to) + " by " + by + (text != null ? ": " + text : "")
				+ (to == FulfilmentStatus.CANCELLED ? " (paid order: refund the customer)" : "");
		events.save(new OrderEvent(order.getId(), "FULFILMENT_" + to.name(), order.getStatus(), order.getStatus(), detail));
		Map<String, Object> extra = new HashMap<>();
		extra.put("fulfilmentStatus", to.name());
		if (text != null) {
			extra.put("note", text);
		}
		publisher.publish(order, "order.fulfilment." + to.name().toLowerCase(), extra);
		log.info("Order {} fulfilment {} -> {}", order.getOrderNumber(), from, to);
		return order;
	}

	private Order lock(String orderNumber) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		return orders.lockById(order.getId()).orElseThrow();
	}

	private static String label(Enum<?> e) {
		return e.name().replace('_', ' ').toLowerCase();
	}
}
