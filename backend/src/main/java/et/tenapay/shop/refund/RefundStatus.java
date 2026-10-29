package et.tenapay.shop.refund;

import java.util.Locale;

/**
 * Where a refund stands. A refund is money we owe the buyer: it stays open (and keeps its amount reserved) until the
 * money is back ({@link #SUCCEEDED} or {@link #PAID_BY_HAND}) or staff cancel it.
 */
public enum RefundStatus {
	/** Saved locally, BillPay not called yet. */
	REQUESTED,
	/** BillPay didn't answer (timeout, 5xx); the retry job resends it with the same Idempotency-Key. */
	ERROR,
	/** BillPay accepted it (UNDER_REVIEW); waiting for the webhook. */
	PENDING,
	SUCCEEDED,
	/** Before V39 a refusal ended the refund. Kept for old rows only; new refusals become RETRY_LATER or NEEDS_STAFF. */
	REFUSED,
	/** BillPay refused for a reason that may pass later (low merchant balance, refund limit); the job tries again. */
	RETRY_LATER,
	/** Refused for good or retries used up: staff try again, pay another way, or cancel. */
	NEEDS_STAFF,
	/** Staff sent the money another way (bank transfer, cash) and recorded the reference. */
	PAID_BY_HAND,
	/** Staff decided it is no longer owed. */
	CANCELLED;

	public boolean isFinal() {
		return this == SUCCEEDED || this == PAID_BY_HAND || this == CANCELLED || this == REFUSED;
	}

	/** Counts against the refundable amount: everything still owed or already given back. */
	public boolean holdsAmount() {
		return this != REFUSED && this != CANCELLED;
	}

	/** The money is back with the buyer. */
	public boolean isRefunded() {
		return this == SUCCEEDED || this == PAID_BY_HAND;
	}

	/** Still owed: not given back yet and not cancelled. */
	public boolean isOpen() {
		return !isFinal();
	}

	/** Maps BillPay's word to the signal it carries; the service decides what a refusal becomes. */
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
