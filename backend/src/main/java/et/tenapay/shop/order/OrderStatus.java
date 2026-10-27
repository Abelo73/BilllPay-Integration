package et.tenapay.shop.order;

import java.util.EnumSet;
import java.util.Set;

public enum OrderStatus {
	PENDING_PAYMENT,
	PAYMENT_FAILED,
	PAID,
	PARTIALLY_REFUNDED,
	REFUNDED,
	EXPIRED,
	CANCELLED,
	REVIEW_REQUIRED,
	/**
	 * M7: the buyer pays the seller in cash at the door. Stock is taken and delivery starts at once; it becomes PAID
	 * when every seller has marked "cash received". Never expires and gets no payment reminders.
	 */
	CASH_ON_DELIVERY;

	/** Orders that still hold a stock reservation and can be paid. */
	public static final Set<OrderStatus> AWAITING_PAYMENT = EnumSet.of(PENDING_PAYMENT, PAYMENT_FAILED);

	public boolean awaitingPayment() {
		return AWAITING_PAYMENT.contains(this);
	}
}
