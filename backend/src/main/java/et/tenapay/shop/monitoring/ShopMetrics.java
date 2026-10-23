package et.tenapay.shop.monitoring;

import java.time.Duration;
import java.util.Locale;

import org.springframework.stereotype.Component;

import et.tenapay.shop.common.AfterCommit;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/**
 * Business metrics for Prometheus (exposed as tenashop_* at /actuator/prometheus). Counters tied to database changes
 * are bumped after the transaction commits, so rolled-back work is never counted. Tag values come from small fixed
 * sets (statuses, BillPay reason codes, instruments) to keep the number of series low.
 */
@Component
public class ShopMetrics {

	private static final String NONE = "none";

	private final MeterRegistry registry;

	public ShopMetrics(MeterRegistry registry) {
		this.registry = registry;
		// Create the main counters at 0. Prometheus' increase() can't see the first event of a series that
		// appears already at 1, so "paid in the last hour" would read 0 after every restart otherwise.
		for (var s : et.tenapay.shop.payment.PaymentStatus.values()) {
			paymentStatusCounter(s.name());
		}
		for (var s : et.tenapay.shop.order.OrderStatus.values()) {
			counter("tenashop.orders.status", "Orders reaching a status", "status", s.name());
		}
		for (var s : et.tenapay.shop.refund.RefundStatus.values()) {
			counter("tenashop.refunds.status", "Refunds reaching a status", "status", s.name());
		}
		for (String r : new String[] { "created", "rejected", "error" }) {
			counter("tenashop.payments.requested", "Payment links requested from BillPay", "result", r);
		}
		for (String r : new String[] { "accepted", "duplicate", "rejected_signature", "invalid_json" }) {
			counter("tenashop.webhooks.received", "BillPay webhook deliveries", "result", r);
		}
	}

	private Counter paymentStatusCounter(String status) {
		return counter("tenashop.payments.status", "Payment attempts reaching a status", "status", status);
	}

	/** One HTTP call to BillPay. outcome: 2xx / 4xx / 5xx / network. */
	public void billPayCall(String operation, Duration took, String outcome) {
		Timer.builder("tenashop.billpay.requests")
				.description("Calls to the BillPay API")
				.tag("operation", operation)
				.tag("outcome", outcome)
				.publishPercentileHistogram()
				.register(registry)
				.record(took);
	}

	/** A checkout link was requested from BillPay. result: created / rejected / error. */
	public void paymentRequested(String result) {
		counter("tenashop.payments.requested", "Payment links requested from BillPay", "result", result).increment();
	}

	/** A payment attempt moved to a new status (SUCCEEDED, FAILED, EXPIRED, ...). */
	public void paymentStatus(String status, String method, String reason) {
		AfterCommit.run(() -> {
			paymentStatusCounter(status).increment();
			if ("SUCCEEDED".equals(status)) {
				counter("tenashop.payments.paid", "Paid attempts by payment method", "method", tag(method)).increment();
			} else if (reason != null && !reason.isBlank()) {
				counter("tenashop.payments.failed", "Failed, cancelled or expired attempts by reason", "reason",
						tag(reason)).increment();
			}
		});
	}

	/** BillPay reported a failed try but kept the payment open for a retry. */
	public void paymentTryFailed(String reason) {
		AfterCommit.run(() -> counter("tenashop.payments.tries.failed", "Failed tries on an open payment",
				"reason", tag(reason)).increment());
	}

	/** result: accepted / duplicate / rejected_signature / invalid_json. */
	public void webhookReceived(String result) {
		counter("tenashop.webhooks.received", "BillPay webhook deliveries", "result", result).increment();
	}

	/** Time from receiving a webhook to applying it (through Kafka). */
	public void webhookProcessed(String status, Duration delay) {
		Timer.builder("tenashop.webhooks.processing.delay")
				.description("Webhook received → processed")
				.tag("status", status)
				.publishPercentileHistogram()
				.register(registry)
				.record(delay.isNegative() ? Duration.ZERO : delay);
	}

	public void orderStatus(String status) {
		AfterCommit.run(() -> counter("tenashop.orders.status", "Orders reaching a status", "status", status).increment());
	}

	public void refundStatus(String status) {
		AfterCommit.run(() -> counter("tenashop.refunds.status", "Refunds reaching a status", "status", status).increment());
	}

	private Counter counter(String name, String description, String tagKey, String tagValue) {
		return Counter.builder(name).description(description).tag(tagKey, tagValue).register(registry);
	}

	private static String tag(String value) {
		return value == null || value.isBlank() ? NONE : value.toUpperCase(Locale.ROOT);
	}
}
