package et.tenapay.shop.order;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.events.OrderEventPublisher;
import et.tenapay.shop.monitoring.ShopMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Nudges customers who started checkout but haven't paid: once per order, {@code app.payment-reminder-before} before
 * the payment window closes, it records a PAYMENT_REMINDER step and publishes {@code order.payment.reminder}, which the
 * notification listener turns into a "finish paying" email. Run every minute by the reconciliation job.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentReminders {

	public static final String EVENT = "PAYMENT_REMINDER";

	private final OrderRepository orders;
	private final OrderEventRepository events;
	private final OrderService orderService;
	private final OrderEventPublisher publisher;
	private final AppProperties app;
	private final TransactionTemplate tx;
	private final ShopMetrics metrics;

	/** Sends the reminders that are due at {@code now}; returns how many. */
	public int sendDue(Instant now) {
		Duration expiry = app.paymentExpiry();
		Duration before = app.paymentReminderBefore();
		if (before == null || before.isZero() || before.isNegative() || expiry == null || before.compareTo(expiry) >= 0) {
			return 0;
		}
		// Orders inside the reminder window: older than (expiry - before), but not yet expired.
		List<UUID> due = orders.findIdsByStatusInAndCreatedAtBetween(OrderStatus.AWAITING_PAYMENT, now.minus(expiry),
				now.minus(expiry.minus(before)));
		int sent = 0;
		for (UUID id : due) {
			try {
				if (Boolean.TRUE.equals(tx.execute(s -> remind(id)))) {
					sent++;
				}
			} catch (RuntimeException e) {
				log.warn("Could not queue a payment reminder for order {}: {}", id, e.getMessage());
			}
		}
		return sent;
	}

	private boolean remind(UUID orderId) {
		Order order = orders.lockById(orderId).orElse(null);
		// re-checked under the lock: it may have been paid, cancelled or reminded since the query
		if (order == null || !order.getStatus().awaitingPayment() || events.existsByOrderIdAndType(orderId, EVENT)) {
			return false;
		}
		Instant payBy = order.getCreatedAt().plus(app.paymentExpiry());
		orderService.note(order, EVENT, "pay by " + payBy);
		publisher.publish(order, "order.payment.reminder", Map.of("payBy", payBy.toString()));
		metrics.paymentReminder();
		log.info("Payment reminder queued for {} (pay by {})", order.getOrderNumber(), payBy);
		return true;
	}
}
