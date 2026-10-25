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
	private final et.tenapay.shop.inbox.InboxService inbox;
	private SmsLanguage language;

	/** Amharic texts for people who use the site in Amharic. Optional so plain unit setups still work. */
	@org.springframework.beans.factory.annotation.Autowired(required = false)
	void setLanguage(SmsLanguage language) {
		this.language = language;
	}

	public SmsOrderNotifier(SmsService sms, OrderRepository orders, TransactionTemplate tx, AppProperties app,
			@Value("${sms.order-updates:true}") boolean enabled, et.tenapay.shop.inbox.InboxService inbox) {
		this.sms = sms;
		this.orders = orders;
		this.tx = tx;
		this.app = app;
		this.enabled = enabled;
		this.inbox = inbox;
	}

	private record OrderInfo(String number, String phone, BigDecimal total, String trackingNote, Instant payBy,
			boolean awaitingPayment, java.util.UUID userId) {
	}

	/** Events older than this are not texted. */
	static final java.time.Duration MAX_AGE = java.time.Duration.ofMinutes(30);

	/** Handles one orders.events message. Unknown types send nothing. */
	public void onOrderEvent(String type, String orderNumber, Instant occurredAt) {
		onOrderEvent(type, orderNumber, occurredAt, null);
	}

	/** {@code seller} is set when the event is about one seller's part of a split order (null = the whole order). */
	public void onOrderEvent(String type, String orderNumber, Instant occurredAt, String seller) {
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
		if (!inbox.wantsSms(o.userId(), et.tenapay.shop.inbox.InboxService.SmsTopic.ORDERS)) {
			return; // the customer turned order texts off (they still see it in the app)
		}
		String text = text(type, o, seller);
		// one reminder per order; the others once per event
		String key = type.equals("order.payment.reminder") ? "SMS:REMINDER:" + o.number()
				: "SMS:" + type + ":" + o.number() + ":" + (seller == null ? "" : seller + ":")
						+ (occurredAt == null ? "" : occurredAt.toString());
		sms.sendOnce(kind, o.phone(), text, o.number(), key.length() > 160 ? key.substring(0, 160) : key);
	}

	private OrderInfo info(Order o) {
		return new OrderInfo(o.getOrderNumber(), o.getCustomerPhone(), o.getTotal(), o.getTrackingNote(),
				o.getCreatedAt() == null || app.paymentExpiry() == null ? null : o.getCreatedAt().plus(app.paymentExpiry()),
				o.getStatus() != null && o.getStatus().awaitingPayment(), o.getUserId());
	}

	String text(String type, OrderInfo o) {
		return text(type, o, null);
	}

	String text(String type, OrderInfo o, String seller) {
		if (language != null && language.amharic(o.userId())) {
			return amharic(type, o, seller);
		}
		String part = seller == null ? null : "part of " + o.number() + from(seller);
		String link = app.publicBaseUrl().replaceAll("/+$", "") + "/orders/track?order=" + o.number();
		return switch (type) {
			case "order.payment.reminder" -> "Sodo Gebeya: " + o.number() + " is not paid yet. Pay by "
					+ (o.payBy() == null ? "soon" : TIME.format(o.payBy())) + " or the items are released: " + link;
			case "order.fulfilment.shipped" -> "Sodo Gebeya: " + (part != null ? part : o.number()) + " is on the way."
					+ rider(o.trackingNote()) + " Track: " + link;
			case "order.fulfilment.delivered" -> "Sodo Gebeya: " + (part != null ? part : o.number()) + " was delivered. Thank you! Problem? " + link;
			default -> "Sodo Gebeya: payment of " + etb(o.total()) + " received for " + o.number()
					+ ". We'll text when it ships. " + link;
		};
	}

	/** The same texts in Amharic. Unicode SMS parts hold 70 characters, so these stay short. */
	String amharic(String type, OrderInfo o, String seller) {
		String link = app.publicBaseUrl().replaceAll("/+$", "") + "/orders/track?order=" + o.number();
		String name = seller == null ? null : seller.trim();
		String what = seller == null ? o.number() : "የ" + o.number() + " ከፊል" + (name == null || name.isEmpty() ? "" : " (" + (name.length() > 20 ? name.substring(0, 20).trim() : name) + ")");
		String note = o.trackingNote() == null || o.trackingNote().isBlank() ? ""
				: " " + (o.trackingNote().length() > 40 ? o.trackingNote().substring(0, 40) : o.trackingNote().trim()) + "።";
		return switch (type) {
			case "order.payment.reminder" -> "ሶዶ ገበያ፦ " + o.number() + " ገና አልተከፈለም። እስከ "
					+ (o.payBy() == null ? "በቅርቡ" : TIME.format(o.payBy())) + " ይክፈሉ፣ ያለበለዚያ እቃዎቹ ይለቀቃሉ፦ " + link;
			case "order.fulfilment.shipped" -> "ሶዶ ገበያ፦ " + what + " በመንገድ ላይ ነው።" + note + " ይከታተሉ፦ " + link;
			case "order.fulfilment.delivered" -> "ሶዶ ገበያ፦ " + what + " ደርሷል። እናመሰግናለን! ችግር ካለ፦ " + link;
			default -> "ሶዶ ገበያ፦ ለ" + o.number() + " የ" + etb(o.total()).replace("ETB", "ብር") + " ክፍያ ደርሷል። ሲላክ እናሳውቅዎታለን። " + link;
		};
	}

	/** " (from Abebe Shoes)": plain letters only, so the SMS stays one part; empty when nothing is left. */
	private static String from(String seller) {
		String plain = seller.replaceAll("[^\\x20-\\x7E]", "").trim();
		if (plain.isEmpty()) {
			return "";
		}
		return " (from " + (plain.length() > 24 ? plain.substring(0, 24).trim() : plain) + ")";
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
