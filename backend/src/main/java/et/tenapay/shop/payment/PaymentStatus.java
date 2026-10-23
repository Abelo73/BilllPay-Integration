package et.tenapay.shop.payment;

import java.util.Locale;

public enum PaymentStatus {
	/** Saved locally, BillPay not called yet (or the call is in flight). */
	CREATED,
	/** BillPay create call failed; safe to retry with the same Idempotency-Key. */
	ERROR,
	PENDING,
	SUCCEEDED,
	FAILED,
	EXPIRED,
	CANCELLED;

	public boolean isFinal() {
		return this == SUCCEEDED || this == FAILED || this == EXPIRED || this == CANCELLED;
	}

	/**
	 * Maps BillPay's status string to ours. The exact vocabulary is unconfirmed (open question Q1),
	 * so common synonyms are accepted. Returns null for unknown values.
	 */
	public static PaymentStatus fromBillPay(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		return switch (raw.trim().toUpperCase(Locale.ROOT)) {
			case "PAID", "SUCCEEDED", "SUCCESS", "SUCCESSFUL", "COMPLETED", "CAPTURED", "SETTLED" -> SUCCEEDED;
			case "FAILED", "FAILURE", "REFUSED", "DECLINED", "REJECTED", "ERROR" -> FAILED;
			case "EXPIRED", "TIMEOUT", "TIMED_OUT" -> EXPIRED;
			case "CANCELLED", "CANCELED", "ABANDONED" -> CANCELLED;
			case "PENDING", "CREATED", "INITIATED", "PROCESSING", "IN_PROGRESS", "OPEN", "AWAITING_PAYMENT" -> PENDING;
			default -> null;
		};
	}
}
