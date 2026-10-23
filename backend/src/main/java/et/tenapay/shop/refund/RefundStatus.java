package et.tenapay.shop.refund;

import java.util.Locale;

public enum RefundStatus {
	/** Saved locally, BillPay not called yet. */
	REQUESTED,
	/** BillPay call failed without an answer; retry with the same Idempotency-Key. */
	ERROR,
	PENDING,
	SUCCEEDED,
	REFUSED;

	public boolean isFinal() {
		return this == SUCCEEDED || this == REFUSED;
	}

	/** Counts against the refundable amount: everything except a refusal. */
	public boolean holdsAmount() {
		return this != REFUSED;
	}

	public static RefundStatus fromBillPay(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		return switch (raw.trim().toUpperCase(Locale.ROOT)) {
			case "SUCCEEDED", "SUCCESS", "SUCCESSFUL", "COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "PROCESSED",
					"PAID" -> SUCCEEDED;
			case "REFUSED", "FAILED", "DECLINED", "REJECTED", "REFUND_REFUSED" -> REFUSED;
			case "PENDING", "PROCESSING", "CREATED", "INITIATED", "REQUESTED" -> PENDING;
			default -> null;
		};
	}
}
