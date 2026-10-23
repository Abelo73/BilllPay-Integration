package et.tenapay.shop.payment.billpay;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Locale;

import tools.jackson.databind.JsonNode;

/**
 * Lenient reader for BillPay JSON. BillPay wraps responses as {statusCode, message, body, timestamp};
 * the field names inside are not yet confirmed (open questions Q1/Q2), so several common names are tried.
 * Once the real shapes are known, trim the alternatives down.
 */
public final class BillPayPayloads {

	private BillPayPayloads() {
	}

	/** Returns the object that describes the payment, unwrapping the envelope and common nestings. */
	public static JsonNode paymentNode(JsonNode root) {
		JsonNode node = root;
		for (String wrapper : new String[] { "body", "data" }) {
			if (node.path(wrapper).isObject()) {
				node = node.path(wrapper);
			}
		}
		for (String nested : new String[] { "payment", "checkout", "transaction" }) {
			if (node.path(nested).isObject()) {
				return node.path(nested);
			}
		}
		return node;
	}

	public static BillPayPayment parsePayment(JsonNode root, String raw) {
		JsonNode p = paymentNode(root);
		return new BillPayPayment(
				text(p, "paymentId", "id", "checkoutId", "transactionId", "reference"),
				text(p, "merchantReference", "merchant_reference"),
				text(p, "checkoutUrl", "checkout_url", "paymentUrl", "redirectUrl", "hostedUrl", "url"),
				text(p, "status", "paymentStatus", "state"),
				text(p, "reasonCode", "reason_code", "failureReason", "reason"),
				decimal(p, "amount"),
				text(p, "currency"),
				text(p, "paymentMethod", "method", "paymentMethodCode"),
				instant(p, "expiresAt", "expires_at", "expiry"),
				raw);
	}

	/** What a webhook is about. BillPay documents "payment captured, failed, refunded, settled" events. */
	public enum EventKind { PAYMENT, REFUND, SETTLEMENT, TEST }

	public static EventKind kind(String eventType, String status) {
		String t = eventType == null ? "" : eventType.toLowerCase(Locale.ROOT);
		String s = status == null ? "" : status.toLowerCase(Locale.ROOT);
		if (t.contains("refund") || s.contains("refund")) {
			return EventKind.REFUND;
		}
		if (t.contains("settle")) {
			return EventKind.SETTLEMENT;
		}
		if (t.contains("test") || t.contains("ping")) {
			return EventKind.TEST;
		}
		return EventKind.PAYMENT;
	}

	/** Status implied by an event name such as "payment.captured", used when the payload has no status field. */
	public static String statusFromEventType(String eventType) {
		if (eventType == null) {
			return null;
		}
		String t = eventType.toLowerCase(Locale.ROOT);
		if (t.contains("captur") || t.contains("succeed") || t.contains("paid") || t.contains("complet")) {
			return "SUCCEEDED";
		}
		if (t.contains("fail") || t.contains("declin") || t.contains("refus")) {
			return "FAILED";
		}
		if (t.contains("expir")) {
			return "EXPIRED";
		}
		if (t.contains("cancel")) {
			return "CANCELLED";
		}
		if (t.contains("pending") || t.contains("created")) {
			return "PENDING";
		}
		return null;
	}

	public static JsonNode refundNode(JsonNode root) {
		JsonNode node = root;
		for (String wrapper : new String[] { "body", "data" }) {
			if (node.path(wrapper).isObject()) {
				node = node.path(wrapper);
			}
		}
		return node.path("refund").isObject() ? node.path("refund") : node;
	}

	public static BillPayRefund parseRefund(JsonNode root, String raw) {
		JsonNode r = refundNode(root);
		JsonNode outer = r == root ? root : BillPayPayloads.paymentNode(root);
		String paymentId = text(r, "paymentId", "payment_id", "checkoutId", "transactionId");
		if (paymentId == null) {
			paymentId = text(outer, "paymentId", "payment_id");
		}
		return new BillPayRefund(
				text(r, "refundId", "refund_id", "id"),
				paymentId,
				text(r, "merchantReference", "refundReference", "merchant_reference"),
				text(r, "status", "refundStatus", "state"),
				text(r, "reasonCode", "reason_code", "failureReason"),
				decimal(r, "amount") != null ? decimal(r, "amount") : decimal(r, "refundedAmount"),
				raw);
	}

	public static String text(JsonNode node, String... names) {
		for (String name : names) {
			JsonNode v = node.path(name);
			if (v.isValueNode() && !v.isNull()) {
				String s = v.asString();
				if (!s.isBlank()) {
					return s;
				}
			}
		}
		return null;
	}

	static BigDecimal decimal(JsonNode node, String name) {
		JsonNode v = node.path(name);
		if (v.isNumber()) {
			return v.decimalValue();
		}
		if (v.isString()) {
			try {
				return new BigDecimal(v.asString().trim());
			} catch (NumberFormatException e) {
				return null;
			}
		}
		return null;
	}

	static Instant instant(JsonNode node, String... names) {
		String s = text(node, names);
		if (s == null) {
			return null;
		}
		try {
			return OffsetDateTime.parse(s).toInstant();
		} catch (RuntimeException e) {
			return null;
		}
	}
}
