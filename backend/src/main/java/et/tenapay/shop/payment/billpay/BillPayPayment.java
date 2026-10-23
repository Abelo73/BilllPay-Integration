package et.tenapay.shop.payment.billpay;

import java.math.BigDecimal;
import java.time.Instant;

/** A payment as BillPay describes it, from an API response or a webhook. Any field may be null. */
public record BillPayPayment(
		String paymentId,
		String merchantReference,
		String checkoutUrl,
		String status,
		String reasonCode,
		BigDecimal amount,
		String currency,
		String paymentMethod,
		Instant expiresAt,
		String raw) {

	public BillPayPayment withStatus(String newStatus) {
		return new BillPayPayment(paymentId, merchantReference, checkoutUrl, newStatus, reasonCode, amount, currency,
				paymentMethod, expiresAt, raw);
	}
}
