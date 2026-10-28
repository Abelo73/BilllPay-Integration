package et.tenapay.shop.payment;

import et.tenapay.shop.payment.billpay.BillPayException;

/**
 * Why BillPay could not open a payment, in words a buyer understands. The buyer never sees HTTP codes; staff see the
 * full answer on the order's payment attempts.
 */
public enum PaymentProblem {

	/** No answer at all (network, timeout). */
	UNREACHABLE("We couldn't reach BillPay. Your order is saved; check your connection and try paying again."),
	/** BillPay answered with 5xx or 429. */
	BUSY("BillPay is busy right now. Your order is saved; please try again in a minute."),
	/** 401/403: our API key is wrong. Only staff can fix it. */
	KEY_REJECTED("Online payment is not available right now. Your order is saved; please try again later or contact us."),
	/** Any other 4xx: BillPay refused the request itself. */
	REFUSED("BillPay could not accept this payment. Your order is saved; please try again or contact us.");

	private final String message;

	PaymentProblem(String message) {
		this.message = message;
	}

	public String message() {
		return message;
	}

	public static PaymentProblem of(BillPayException e) {
		return ofHttp(e.isNetworkError() ? 0 : e.getHttpStatus());
	}

	static PaymentProblem ofHttp(int status) {
		if (status <= 0) {
			return UNREACHABLE;
		}
		if (status == 401 || status == 403) {
			return KEY_REJECTED;
		}
		if (status == 429 || status >= 500) {
			return BUSY;
		}
		return REFUSED;
	}

	/**
	 * Reads it back from a stored attempt that never got a checkout link: ERROR = no answer or 5xx (kept for a retry),
	 * FAILED with REJECTED_HTTP_xxx = a 4xx. Null when the attempt did get going.
	 */
	public static PaymentProblem of(PaymentAttempt a) {
		if (a.getCheckoutUrl() != null) {
			return null;
		}
		if (a.getStatus() == PaymentStatus.ERROR) {
			String err = a.getError() == null ? "" : a.getError();
			return err.startsWith("BillPay unreachable") ? UNREACHABLE : BUSY;
		}
		String reason = a.getReasonCode();
		if (a.getStatus() == PaymentStatus.FAILED && reason != null && reason.startsWith("REJECTED_HTTP_")) {
			try {
				return ofHttp(Integer.parseInt(reason.substring("REJECTED_HTTP_".length())));
			} catch (NumberFormatException e) {
				return REFUSED;
			}
		}
		return null;
	}
}
