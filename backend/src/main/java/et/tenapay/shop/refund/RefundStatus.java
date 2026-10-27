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
			// UNDER_REVIEW: what BillPay answers when it accepts a refund (2026-10-27)
			case "PENDING", "PROCESSING", "CREATED", "INITIATED", "REQUESTED", "UNDER_REVIEW", "IN_REVIEW",
					"APPROVED" -> PENDING;
			default -> null;
		};
	}
}
