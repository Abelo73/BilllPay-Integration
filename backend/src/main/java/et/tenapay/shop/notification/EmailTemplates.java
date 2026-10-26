package et.tenapay.shop.notification;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;

import org.springframework.web.util.HtmlUtils;

/**
 * Customer emails as simple, inline-styled HTML (works in Gmail/Outlook) plus a plain-text copy. Everything that
 * came from a person (names, addresses, notes) is HTML-escaped.
 */
final class EmailTemplates {

	private EmailTemplates() {
	}

	enum Kind {
		ORDER_PLACED, PAYMENT_REMINDER, PAYMENT_CONFIRMED, PAYMENT_FAILED, SHIPPED, DELIVERED, CANCELLED, EXPIRED, REFUNDED,
		PASSWORD_CHANGED, STAFF_SIGN_IN_CODE
	}

	record Email(String subject, String html, String text) {
	}

	record Item(String name, int quantity, BigDecimal lineTotal) {
	}

	record OrderView(String orderNumber, String customerName, List<Item> items, BigDecimal subtotal, String discountCode,
			BigDecimal discount,
			BigDecimal deliveryFee, BigDecimal total, String deliveryAddress, String deliveryCity, String trackingNote,
			String reasonCode, String trackUrl,
			/** Local time the payment window closes (HH:mm, Addis Ababa), for unpaid orders. */
			String payBy) {
	}

	private static final String BRAND = "#0E5A43";

	static Email order(Kind kind, OrderView o) {
		String first = firstName(o.customerName());
		return switch (kind) {
			case ORDER_PLACED -> build("We got your order " + o.orderNumber(), "Thanks for your order, " + first + "!",
					"Your order is saved. Finish paying on BillPay to confirm it; the items are held for you for 30 minutes.",
					o, "Complete payment");
			case PAYMENT_REMINDER -> build("Your order " + o.orderNumber() + " is waiting: pay by " + o.payBy(),
					"Your items are still waiting, " + first,
					"You started checkout but we haven't received a payment yet. We're holding your items until "
							+ o.payBy() + " (Addis Ababa time); after that they go back on sale."
							+ (o.reasonCode() != null ? " Your last try didn't go through: " + reason(o.reasonCode()) : ""),
					o, "Finish paying");
			case PAYMENT_CONFIRMED -> build("Payment confirmed for " + o.orderNumber(), "Payment confirmed",
					"BillPay confirmed your payment. We're preparing your order and will let you know when it's on the way.",
					o, "Track your order");
			case PAYMENT_FAILED -> build("Your payment for " + o.orderNumber() + " didn't go through",
					"Payment didn't go through",
					reason(o.reasonCode()) + " Your items are still reserved, so you can try again with another number or method.",
					o, "Try paying again");
			case SHIPPED -> build("Your order " + o.orderNumber() + " is on the way", "Your order is on the way",
					"Our rider is bringing your order to " + o.deliveryAddress() + ", " + o.deliveryCity()
							+ ". They'll call you before arriving."
							+ (o.trackingNote() != null ? " Rider: " + o.trackingNote() + "." : ""),
					o, "Track your order");
			case DELIVERED -> build("Delivered: " + o.orderNumber(), "Delivered",
					"Your order was delivered. Enjoy, " + first + ", and thank you for shopping on Sodo Gebeya!", o,
					"View your order");
			case CANCELLED -> build("Order " + o.orderNumber() + " cancelled", "Your order was cancelled",
					"This order was cancelled. If you already paid, we'll refund you through BillPay.", o, "View your order");
			case EXPIRED -> build("Order " + o.orderNumber() + " expired", "Your payment window closed",
					"We didn't receive a payment in time, so the order was released. Still want these items? Open the order and tap \"Order again\" to put them back in your cart.",
					o, "Order again");
			case REFUNDED -> build("Refund issued for " + o.orderNumber(), "Refund issued",
					"We've sent a refund through BillPay to the method you paid with.", o, "View your order");
			case PASSWORD_CHANGED, STAFF_SIGN_IN_CODE -> throw new IllegalArgumentException("not an order email");
		};
	}

	static Email passwordChanged(String fullName, String when) {
		String title = "Your password was changed";
		String body = "Hi " + firstName(fullName) + ", the password of your Sodo Gebeya account was changed on " + when
				+ ". All other devices were signed out. If this wasn't you, reset your password and contact us.";
		String html = frame(title, "<p style=\"margin:0 0 16px\">" + esc(body) + "</p>");
		return new Email("Your Sodo Gebeya password was changed", html, title + "\n\n" + body + "\n\n— Sodo Gebeya");
	}

	static Email staffSignInCode(String fullName, String code) {
		String title = "Your sign-in code";
		String body = "Hi " + firstName(fullName) + ", your Sodo Gebeya admin sign-in code is " + code
				+ ". It works for 10 minutes. If you didn't just sign in, change your password now.";
		String html = frame(title, "<p style=\"margin:0 0 16px\">" + esc(body) + "</p><p style=\"font-size:28px;font-weight:800;letter-spacing:6px;margin:0\">"
				+ esc(code) + "</p>");
		return new Email("Sodo Gebeya admin sign-in code: " + code, html, title + "\n\n" + body + "\n\n— Sodo Gebeya");
	}

	private static Email build(String subject, String title, String intro, OrderView o, String cta) {
		StringBuilder rows = new StringBuilder();
		StringBuilder text = new StringBuilder(title).append("\n\n").append(intro).append("\n\nOrder ")
				.append(o.orderNumber()).append("\n");
		for (Item i : o.items()) {
			rows.append("<tr><td style=\"padding:6px 0\">").append(esc(i.name())).append(" <span style=\"color:#6b7280\">× ")
					.append(i.quantity()).append("</span></td><td style=\"padding:6px 0;text-align:right\">")
					.append(etb(i.lineTotal())).append("</td></tr>");
			text.append("  ").append(i.name()).append(" x").append(i.quantity()).append("  ").append(etb(i.lineTotal()))
					.append("\n");
		}
		String fee = o.deliveryFee() == null || o.deliveryFee().signum() == 0 ? "Free" : etb(o.deliveryFee());
		rows.append(line("Subtotal", etb(o.subtotal()), false));
		if (o.discount() != null && o.discount().signum() > 0) {
			rows.append(line("Discount (" + esc(o.discountCode()) + ")", "-" + etb(o.discount()), false));
			text.append("  Discount ").append(o.discountCode()).append(" -").append(etb(o.discount())).append("\n");
		}
		rows.append(line("Delivery", fee, false))
				.append(line("Total", etb(o.total()), true));
		text.append("  Delivery ").append(fee).append("\n  Total ").append(etb(o.total())).append("\n");

		String delivery = "";
		if (o.deliveryAddress() != null) {
			delivery = "<p style=\"margin:16px 0 0;color:#374151\"><strong>Deliver to:</strong> " + esc(o.deliveryAddress())
					+ ", " + esc(o.deliveryCity()) + "</p>";
			text.append("\nDeliver to: ").append(o.deliveryAddress()).append(", ").append(o.deliveryCity()).append("\n");
		}
		text.append("\n").append(cta).append(": ").append(o.trackUrl()).append("\n\n— Sodo Gebeya");

		String body = "<p style=\"margin:0 0 16px\">" + esc(intro) + "</p>"
				+ "<p style=\"margin:0 0 8px;color:#6b7280;font-size:13px\">Order <span style=\"font-family:monospace\">"
				+ esc(o.orderNumber()) + "</span></p>"
				+ "<table role=\"presentation\" width=\"100%\" style=\"border-collapse:collapse;font-size:14px\">" + rows
				+ "</table>" + delivery
				+ "<p style=\"margin:24px 0 0\"><a href=\"" + esc(o.trackUrl()) + "\" style=\"background:" + BRAND
				+ ";color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600\">"
				+ esc(cta) + "</a></p>";
		return new Email(subject, frame(title, body), text.toString());
	}

	private static String line(String label, String value, boolean strong) {
		String style = "padding:6px 0;border-top:1px solid #e5e7eb" + (strong ? ";font-weight:700" : "");
		return "<tr><td style=\"" + style + "\">" + label + "</td><td style=\"" + style + ";text-align:right\">" + value
				+ "</td></tr>";
	}

	private static String frame(String title, String body) {
		return "<!doctype html><html><body style=\"margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827\">"
				+ "<table role=\"presentation\" width=\"100%\" style=\"padding:24px 12px\"><tr><td align=\"center\">"
				+ "<table role=\"presentation\" width=\"100%\" style=\"max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden\">"
				+ "<tr><td style=\"background:" + BRAND + ";padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700\">Sodo Gebeya</td></tr>"
				+ "<tr><td style=\"padding:24px\"><h1 style=\"margin:0 0 12px;font-size:22px\">" + esc(title) + "</h1>" + body
				+ "</td></tr>"
				+ "<tr><td style=\"padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px\">Sodo Gebeya · Wolaita Sodo · Payments by BillPay</td></tr>"
				+ "</table></td></tr></table></body></html>";
	}

	private static String reason(String code) {
		if (code == null) {
			return "BillPay couldn't complete the payment.";
		}
		return switch (code) {
			case "INSUFFICIENT_FUNDS" -> "There wasn't enough money in the account.";
			case "CUSTOMER_DECLINED" -> "The payment was declined on your phone.";
			case "ACCOUNT_BLOCKED" -> "The account used is blocked.";
			case "LIMIT_EXCEEDED" -> "The account's limit was reached.";
			case "PROVIDER_TIMEOUT" -> "The payment provider didn't answer in time.";
			default -> "BillPay couldn't complete the payment (" + code + ").";
		};
	}

	private static String firstName(String name) {
		return name == null || name.isBlank() ? "there" : name.trim().split("\\s+")[0];
	}

	static String etb(BigDecimal amount) {
		DecimalFormat f = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
		return "ETB " + f.format(amount == null ? BigDecimal.ZERO : amount);
	}

	private static String esc(String s) {
		return s == null ? "" : HtmlUtils.htmlEscape(s);
	}
}
