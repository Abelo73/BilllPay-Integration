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
		ORDER_PLACED, CASH_ORDERED, PAYMENT_REMINDER, PAYMENT_CONFIRMED, PAYMENT_FAILED, SHIPPED, DELIVERED, CANCELLED, EXPIRED, REFUNDED,
		PASSWORD_CHANGED, STAFF_SIGN_IN_CODE, SIGN_UP_CODE, PASSWORD_RESET_CODE, EMAIL_CONFIRM_CODE
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
			case CASH_ORDERED -> build("We got your order " + o.orderNumber() + ": pay cash on delivery", "Thanks for your order, " + first + "!",
					"You chose cash on delivery: pay " + o.total() + " birr in cash when your items arrive, or when you pick them up. The seller confirms the cash, and we email you when it's delivered.",
					o, "Track your order");
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
			case PASSWORD_CHANGED, STAFF_SIGN_IN_CODE, SIGN_UP_CODE, PASSWORD_RESET_CODE, EMAIL_CONFIRM_CODE -> throw new IllegalArgumentException("not an order email");
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

	/** Forgot password: a code to type on the reset page. Only the person who owns the email gets it. */
	static Email resetCode(String code) {
		String title = "Reset your password";
		String intro = "Someone asked to reset the password for your Sodo Gebeya account. Enter this code on the reset page to choose a new password.";
		String html = frame(title, "<p style=\"margin:0 0 20px;line-height:1.6\">" + esc(intro) + "</p>"
				+ codeBoxes(code)
				+ "<p style=\"margin:20px 0 0;text-align:center\"><span style=\"display:inline-block;background:#FDF3E1;color:#8A5A00;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700\">Expires in 5 minutes</span></p>"
				+ "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin:24px 0 8px\"><tr><td style=\"background:#F3F7F5;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:#374151\">"
				+ "<strong style=\"color:#0B3F2F\">Didn't ask for this?</strong> Ignore this email. Your password stays the same, and nobody can use this code without it."
				+ "</td></tr></table>"
				+ "<p style=\"margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6\">Never share this code. Sodo Gebeya staff will never ask for it.</p>");
		String text = title + "\n\n" + intro + "\n\nYour code: " + code + "\n\nIt expires in 5 minutes. Didn't ask for this? Ignore this email; your password stays the same. Never share the code.\n\n— Sodo Gebeya";
		return new Email("Your Sodo Gebeya password reset code", html, text);
	}

	/** The six digits in separate boxes, so the code is easy to read and to copy by hand. */
	static Email confirmCode(String code) {
		String title = "Confirm your email";
		String intro = "Enter this code to confirm your email and sign in to your Sodo Gebeya account. It works for 5 minutes.";
		String html = frame(title, "<p style=\"margin:0 0 20px;line-height:1.6\">" + esc(intro) + "</p>" + codeBoxes(code)
				+ "<p style=\"margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6\">Didn't try to sign in? Ignore this email and change your password. Never share this code.</p>");
		String text = title + "\n\n" + intro + "\n\nYour code: " + code + "\n\nDidn't try to sign in? Ignore this email and change your password. Never share the code.\n\n— Sodo Gebeya";
		return new Email("Your Sodo Gebeya confirmation code", html, text);
	}

	private static String codeBoxes(String code) {
		StringBuilder row = new StringBuilder("<table role=\"presentation\" align=\"center\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin:0 auto\"><tr>");
		for (int i = 0; i < code.length(); i++) {
			if (i > 0) {
				row.append("<td style=\"width:8px\"></td>");
			}
			row.append("<td align=\"center\" style=\"width:46px;height:58px;border:2px solid #14734F;border-radius:12px;background:#F3FAF7;"
					+ "font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:800;color:#0B3F2F\">")
					.append(esc(String.valueOf(code.charAt(i)))).append("</td>");
		}
		return row.append("</tr></table>").toString();
	}

	/** No code in the subject: subjects are stored in the notifications table and shown in the admin. */
	static Email signUpCode(String code) {
		String title = "Confirm your email";
		String body = "Your Sodo Gebeya code is below. Type it on the sign-up page to create your account. It works for 5 minutes."
				+ " Never share it, not even with our staff. If you didn't just sign up, you can ignore this email.";
		String html = frame(title, "<p style=\"margin:0 0 16px\">" + esc(body) + "</p><p style=\"font-size:28px;font-weight:800;letter-spacing:6px;margin:0\">"
				+ esc(code) + "</p>");
		return new Email("Your Sodo Gebeya sign-up code", html, title + "\n\n" + body + "\n\n" + code + "\n\n— Sodo Gebeya");
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
		text.append("\n").append(cta).append(": ").append(o.trackUrl())
				.append("\n\n— Sodo Gebeya\nThis is an automated message. Please don't reply to it.");

		String body = "<p style=\"margin:0 0 16px\">" + esc(intro) + "</p>"
				+ "<p style=\"margin:0 0 8px;color:#6b7280;font-size:13px\">Order <span style=\"font-family:monospace\">"
				+ esc(o.orderNumber()) + "</span></p>"
				+ "<table role=\"presentation\" width=\"100%\" style=\"border-collapse:collapse;font-size:14px\">" + rows
				+ "</table>" + delivery
				+ "<p style=\"margin:24px 0 0\"><a href=\"" + esc(o.trackUrl()) + "\" style=\"background:" + BRAND
				+ ";color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;display:inline-block;font-weight:700;font-size:15px\">"
				+ esc(cta) + "</a></p>";
		return new Email(subject, frame(title, body), text.toString());
	}

	private static String line(String label, String value, boolean strong) {
		String style = "padding:6px 0;border-top:1px solid #e5e7eb" + (strong ? ";font-weight:700" : "");
		return "<tr><td style=\"" + style + "\">" + label + "</td><td style=\"" + style + ";text-align:right\">" + value
				+ "</td></tr>";
	}

	/**
	 * The shared layout of every email: brand header, a hidden preview line, the content in a card, and a footer that
	 * says plainly that the message is automated. Tables and inline styles only, so mail apps show it the same way.
	 */
	private static String frame(String title, String body) {
		return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
				+ "<meta name=\"color-scheme\" content=\"light\"><title>" + esc(title) + "</title></head>"
				+ "<body style=\"margin:0;padding:0;background:#eef4f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827\">"
				+ "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">" + esc(title) + " · Sodo Gebeya</div>"
				+ "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#eef4f1\"><tr><td align=\"center\" style=\"padding:28px 12px\">"
				+ "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(14,90,67,.10)\">"
				// header band
				+ "<tr><td style=\"background:" + BRAND + ";background-image:linear-gradient(135deg,#0E5A43,#14734F);padding:22px 28px\">"
				+ "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr>"
				+ "<td style=\"color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.2px\">Sodo <span style=\"color:#F2B65A\">Gebeya</span></td>"
				+ "<td align=\"right\" style=\"color:#CFE8DC;font-size:12px\">Wolaita Sodo</td></tr></table></td></tr>"
				// content
				+ "<tr><td style=\"padding:28px 28px 8px\"><h1 style=\"margin:0 0 14px;font-size:24px;line-height:1.25;color:#0B3F2F\">" + esc(title) + "</h1>"
				+ body + "</td></tr>"
				// footer
				+ "<tr><td style=\"padding:20px 28px 26px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6\">"
				+ "<p style=\"margin:0 0 6px\"><strong style=\"color:#374151\">This is an automated message. Please don't reply to it.</strong></p>"
				+ "<p style=\"margin:0\">For help, open <strong>Help</strong> on the Sodo Gebeya website. Payments are handled by BillPay; we never ask for your PIN or password by email.</p>"
				+ "<p style=\"margin:12px 0 0;color:#9ca3af\">© Sodo Gebeya · Wolaita Sodo, Ethiopia</p>"
				+ "</td></tr></table></td></tr></table></body></html>";
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
