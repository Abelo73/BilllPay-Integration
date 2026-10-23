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
	REVIEW_REQUIRED;

	/** Orders that still hold a stock reservation and can be paid. */
	public static final Set<OrderStatus> AWAITING_PAYMENT = EnumSet.of(PENDING_PAYMENT, PAYMENT_FAILED);

	public boolean awaitingPayment() {
		return AWAITING_PAYMENT.contains(this);
	}
}
