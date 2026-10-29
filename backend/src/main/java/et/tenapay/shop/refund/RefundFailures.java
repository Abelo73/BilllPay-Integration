package et.tenapay.shop.refund;

import java.time.Duration;
import java.util.List;
import java.util.Locale;

/**
 * What to do after BillPay says no to a refund, by its reason code or message. BillPay has not yet listed its refund
 * reason codes (guide question 1), so this matches the words they are likely to use; an unknown refusal goes to staff,
 * never into a retry loop.
 */
final class RefundFailures {

	private RefundFailures() {
	}

	enum Kind {
		/** May pass later on its own: try again on the schedule. */
		RETRY,
		/** Possibly temporary: one more try, then staff. */
		RETRY_ONCE,
		/** Will not pass by trying again. */
		STAFF,
		/** BillPay's numbers and ours disagree: staff must compare before anything else. */
		MISMATCH
	}

	record Decision(Kind kind, String why) {
	}

	/** Waits after a refusal that may pass later. */
	static final List<Duration> RETRY_WAITS = List.of(Duration.ofMinutes(30), Duration.ofHours(2), Duration.ofHours(6),
			Duration.ofHours(24));

	/** Waits after BillPay didn't answer (same Idempotency-Key, so a resend can't refund twice). */
	static final List<Duration> NO_ANSWER_WAITS = List.of(Duration.ofMinutes(5), Duration.ofMinutes(30),
			Duration.ofHours(2), Duration.ofHours(6), Duration.ofHours(24));

	/** Statuses that mean "not processed, ask again" rather than "no". */
	static boolean noAnswer(int httpStatus) {
		return httpStatus <= 0 || httpStatus == 408 || httpStatus == 409 || httpStatus == 425 || httpStatus == 429
				|| httpStatus >= 500;
	}

	static Decision classify(String reasonCode, String body) {
		String s = ((reasonCode == null ? "" : reasonCode) + " " + (body == null ? "" : body)).toUpperCase(Locale.ROOT);
		if (has(s, "REFUND LIMIT", "REFUND_LIMIT", "INSUFFICIENT", "BALANCE", "SETTLE OR CLEAR")) {
			return new Decision(Kind.RETRY,
					"BillPay says the merchant balance or refund limit is too low; it is tried again after settlement.");
		}
		if (has(s, "NOT_CAPTURED", "NOT CAPTURED", "NOT YET CAPTURED", "UNCAPTURED")) {
			return new Decision(Kind.RETRY, "BillPay says the payment isn't captured yet; it is tried again later.");
		}
		if (has(s, "EXCEED", "MORE THAN", "REFUNDABLE", "ALREADY_REFUNDED", "ALREADY REFUNDED", "FULLY_REFUNDED")) {
			return new Decision(Kind.MISMATCH, "BillPay thinks less is left to refund than we do. Compare this payment"
					+ " with the BillPay dashboard (a refund made there?) before trying again or paying by hand.");
		}
		if (has(s, "METHOD", "CHANNEL", "NOT_SUPPORTED", "NOT SUPPORTED", "UNSUPPORTED")) {
			return new Decision(Kind.STAFF,
					"This payment method can't take a refund back. Pay the buyer another way and record it.");
		}
		if (has(s, "ACCOUNT_CLOSED", "ACCOUNT CLOSED", "WALLET_CLOSED", "CLOSED_ACCOUNT", "DORMANT")) {
			return new Decision(Kind.STAFF, "The buyer's wallet or account is closed. Check their ID, then pay another"
					+ " way and record it.");
		}
		if (has(s, "EXPIRED", "WINDOW", "TOO_LATE", "TOO LATE", "TOO_OLD")) {
			return new Decision(Kind.STAFF, "BillPay says it's too late to refund this payment. Pay another way and"
					+ " record it.");
		}
		if (has(s, "BANK", "NETWORK", "SWITCH", "PROVIDER", "TIMEOUT", "UNAVAILABLE", "TEMPORAR", "TRY AGAIN")) {
			return new Decision(Kind.RETRY_ONCE, "The bank or payment network turned it down; it is tried once more.");
		}
		String code = reasonCode != null ? reasonCode : "no reason code";
		return new Decision(Kind.STAFF, "BillPay refused the refund (" + code + "). Try again, pay another way, or"
				+ " cancel it.");
	}

	private static boolean has(String s, String... words) {
		for (String w : words) {
			if (s.contains(w)) {
				return true;
			}
		}
		return false;
	}
}
