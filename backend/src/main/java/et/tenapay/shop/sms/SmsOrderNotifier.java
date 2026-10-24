package et.tenapay.shop.sms;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderRepository;
import lombok.extern.slf4j.Slf4j;

/**
 * Short order updates by SMS, from the orders.events Kafka topic. Only the four that matter most, because every SMS
 * costs money: finish-paying reminder, payment confirmed, on the way, delivered. Each event sends at most once
 * (dedupe key), only to Ethiopian mobile numbers, and the texts are plain ASCII so each fits one 160-character SMS.
 * Turn off with {@code SMS_ORDER_UPDATES=false}.
 */
@Slf4j
@Service
public class SmsOrderNotifier {

	private static final Pattern MOBILE = Pattern.compile("^\\+251[79]\\d{8}$");
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Africa/Addis_Ababa"));

	private final SmsService sms;
	private final OrderRepository orders;
	private final TransactionTemplate tx;
	private final AppProperties app;
	private final boolean enabled;

	public SmsOrderNotifier(SmsService sms, OrderRepository orders, TransactionTemplate tx, AppProperties app,
			@Value("${sms.order-updates:true}") boolean enabled) {
		this.sms = sms;
		this.orders = orders;
		this.tx = tx;
		this.app = app;
		this.enabled = enabled;
	}

	private record OrderInfo(String number, String phone, BigDecimal total, String trackingNote, Instant payBy,
			boolean awaitingPayment) {
	}

	/** Events older than this are not texted. */
	static final java.time.Duration MAX_AGE = java.time.Duration.ofMinutes(30);

	/** Handles one orders.events message. Unknown types send nothing. */
	public void onOrderEvent(String type, String orderNumber, Instant occurredAt) {
		if (!enabled || type == null || orderNumber == null) {
			return;
		}
		// after an outage, a text about something that happened long ago helps nobody (and costs money)
		if (occurredAt != null && occurredAt.isBefore(Instant.now().minus(MAX_AGE))) {
			log.info("Skipping SMS for {} {}: event is older than {}", type, orderNumber, MAX_AGE);
			return;
		}
		SmsService.Kind kind;
		switch (type) {
			case "order.payment.reminder" -> kind = SmsService.Kind.PAYMENT;
			case "order.paid", "order.review.resolved" -> kind = SmsService.Kind.PAYMENT;
			case "order.fulfilment.shipped", "order.fulfilment.delivered" -> kind = SmsService.Kind.DELIVERY;
			default -> {
				return;
			}
		}
		Optional<OrderInfo> info = tx.execute(s -> orders.findByOrderNumber(orderNumber).map(this::info));
		if (info == null || info.isEmpty() || info.get().phone() == null || !MOBILE.matcher(info.get().phone()).matches()) {
			return;
		}
		OrderInfo o = info.get();
		if (type.equals("order.payment.reminder") && !o.awaitingPayment()) {
			return; // paid, cancelled or expired since the reminder was queued
		}
		String text = text(type, o);
		// one reminder per order; the others once per event
		String key = type.equals("order.payment.reminder") ? "SMS:REMINDER:" + o.number()
				: "SMS:" + type + ":" + o.number() + ":" + (occurredAt == null ? "" : occurredAt.toString());
		sms.sendOnce(kind, o.phone(), text, o.number(), key.length() > 160 ? key.substring(0, 160) : key);
	}

	private OrderInfo info(Order o) {
		return new OrderInfo(o.getOrderNumber(), o.getCustomerPhone(), o.getTotal(), o.getTrackingNote(),
				o.getCreatedAt() == null || app.paymentExpiry() == null ? null : o.getCreatedAt().plus(app.paymentExpiry()),
				o.getStatus() != null && o.getStatus().awaitingPayment());
	}

	String text(String type, OrderInfo o) {
		String link = app.publicBaseUrl().replaceAll("/+$", "") + "/orders/track?order=" + o.number();
		return switch (type) {
			case "order.payment.reminder" -> "Sodo Gebeya: " + o.number() + " is not paid yet. Pay by "
					+ (o.payBy() == null ? "soon" : TIME.format(o.payBy())) + " or the items are released: " + link;
			case "order.fulfilment.shipped" -> "Sodo Gebeya: " + o.number() + " is on the way."
					+ rider(o.trackingNote()) + " Track: " + link;
			case "order.fulfilment.delivered" -> "Sodo Gebeya: " + o.number() + " was delivered. Thank you! Problem? " + link;
			default -> "Sodo Gebeya: payment of " + etb(o.total()) + " received for " + o.number()
					+ ". We'll text when it ships. " + link;
		};
	}

	/** The rider note, kept short and plain so the SMS stays one part. */
	private static String rider(String note) {
		if (note == null || note.isBlank()) {
			return "";
		}
		String plain = note.replaceAll("[^\\x20-\\x7E]", "").trim();
		if (plain.isEmpty()) {
			return "";
		}
		return " " + (plain.length() > 40 ? plain.substring(0, 40) : plain) + ".";
	}

	private static String etb(BigDecimal amount) {
		DecimalFormat f = new DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.US));
		return f.format(amount == null ? BigDecimal.ZERO : amount) + " ETB";
	}
}
