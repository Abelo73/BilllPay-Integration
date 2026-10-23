package et.tenapay.shop.payment.billpay;

import java.math.BigDecimal;

/** A refund as BillPay describes it. Any field may be null; field names are unconfirmed (Q6). */
public record BillPayRefund(
		String refundId,
		String paymentId,
		String merchantReference,
		String status,
		String reasonCode,
		BigDecimal amount,
		String raw) {
}
