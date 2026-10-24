package et.tenapay.shop.payment;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Safety net for missing webhooks: polls BillPay for stale payments, reminds customers who haven't paid yet, and
 * expires unpaid orders.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReconciliationJob {

	private static final Duration RECHECK_INTERVAL = Duration.ofMinutes(1);

	private final PaymentAttemptRepository attempts;
	private final OrderRepository orders;
	private final PaymentService payments;
	private final et.tenapay.shop.order.PaymentReminders reminders;
	private final AppProperties app;

	@Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT30S")
	public void run() {
		Instant now = Instant.now();
		List<UUID> due = attempts.findDueForReconciliation(List.of(PaymentStatus.PENDING),
				now.minus(app.reconcileAfter()), now.minus(RECHECK_INTERVAL), PageRequest.of(0, 50));
		for (UUID id : due) {
			PaymentService.Outcome outcome = payments.reconcile(id);
			log.debug("Reconciled attempt {}: {}", id, outcome);
		}

		try {
			reminders.sendDue(now);
		} catch (RuntimeException e) {
			log.warn("Payment reminders failed: {}", e.getMessage());
		}

		List<UUID> stale = orders.findIdsByStatusInAndCreatedAtBefore(OrderStatus.AWAITING_PAYMENT,
				now.minus(app.paymentExpiry()));
		for (UUID orderId : stale) {
			try {
				payments.expireOrder(orderId);
			} catch (RuntimeException e) {
				log.warn("Could not expire order {}: {}", orderId, e.getMessage());
			}
		}
	}
}
