package et.tenapay.shop.notification;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.notification.EmailTemplates.Email;
import et.tenapay.shop.notification.EmailTemplates.Kind;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;

/**
 * Sends customer emails for order events (from the orders.events Kafka topic) and account events. Each email is
 * logged in the notifications table first; its unique key makes a re-delivered Kafka message a no-op. A failed send
 * is recorded as FAILED and not retried, so an SMTP outage can't flood customers later.
 */
@Slf4j
@Service
public class NotificationService {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm")
			.withZone(ZoneId.of("Africa/Addis_Ababa"));

	/** Kafka event type → email. Events not listed here send nothing. */
	private static final Map<String, Kind> KINDS = Map.ofEntries(
			Map.entry("order.placed", Kind.ORDER_PLACED),
			Map.entry("order.paid", Kind.PAYMENT_CONFIRMED),
			Map.entry("order.review.resolved", Kind.PAYMENT_CONFIRMED),
			Map.entry("order.payment.failed", Kind.PAYMENT_FAILED),
			Map.entry("order.fulfilment.shipped", Kind.SHIPPED),
			Map.entry("order.fulfilment.delivered", Kind.DELIVERED),
			Map.entry("order.cancelled", Kind.CANCELLED),
			Map.entry("order.fulfilment.cancelled", Kind.CANCELLED),
			Map.entry("order.expired", Kind.EXPIRED),
			Map.entry("order.refunded", Kind.REFUNDED),
			Map.entry("order.partially.refunded", Kind.REFUNDED));

	private final NotificationRepository notifications;
	private final OrderRepository orders;
	private final PaymentAttemptRepository attempts;
	private final ObjectProvider<JavaMailSender> mailSender;
	private final AppProperties app;
	private final TransactionTemplate tx;

	public NotificationService(NotificationRepository notifications, OrderRepository orders,
			PaymentAttemptRepository attempts, ObjectProvider<JavaMailSender> mailSender, AppProperties app,
			TransactionTemplate tx) {
		this.notifications = notifications;
		this.orders = orders;
		this.attempts = attempts;
		this.mailSender = mailSender;
		this.app = app;
		this.tx = tx;
	}

	/** Handles one orders.events message: type, orderNumber, occurredAt. */
	public void onOrderEvent(String type, String orderNumber, Instant occurredAt) {
		Kind kind = KINDS.get(type);
		if (kind == null || orderNumber == null) {
			return;
		}
		String key = kind + ":" + orderNumber + ":" + (occurredAt == null ? "" : occurredAt.toString());
		if (notifications.existsByDedupeKey(key)) {
			log.debug("Email {} already handled", key);
			return;
		}
		Optional<EmailTemplates.OrderView> view = tx.execute(s -> orders.findByOrderNumber(orderNumber).map(this::view));
		if (view == null || view.isEmpty()) {
			return;
		}
		String recipient = tx.execute(s -> orders.findByOrderNumber(orderNumber).map(Order::getCustomerEmail).orElse(null));
		send(kind, key, orderNumber, recipient, EmailTemplates.order(kind, view.get()));
	}

	public void onPasswordChanged(java.util.UUID userId, int tokenVersion, String email, String fullName) {
		send(Kind.PASSWORD_CHANGED, "PASSWORD_CHANGED:" + userId + ":" + tokenVersion, null, email,
				EmailTemplates.passwordChanged(fullName, WHEN.format(Instant.now())));
	}

	private EmailTemplates.OrderView view(Order o) {
		String base = app.publicBaseUrl().replaceAll("/+$", "");
		String reason = attempts.findFirstByOrderIdOrderByAttemptNoDesc(o.getId()).map(a -> a.getReasonCode())
				.orElse(null);
		return new EmailTemplates.OrderView(o.getOrderNumber(), o.getCustomerName(),
				o.getItems().stream()
						.map(i -> new EmailTemplates.Item(i.getProductName(), i.getQuantity(), i.getLineTotal()))
						.toList(),
				o.getSubtotal(), o.getDeliveryFee(), o.getTotal(), o.getDeliveryAddress(), o.getDeliveryCity(),
				o.getTrackingNote(), reason, base + "/orders/track?order=" + o.getOrderNumber());
	}

	private void send(Kind kind, String key, String orderNumber, String recipient, Email email) {
		if (recipient == null || recipient.isBlank()) {
			return;
		}
		Notification n = new Notification();
		n.setKind(kind.name());
		n.setDedupeKey(key);
		n.setOrderNumber(orderNumber);
		n.setRecipient(recipient);
		n.setSubject(email.subject());
		JavaMailSender sender = app.mail().enabled() ? mailSender.getIfAvailable() : null;
		n.setStatus(sender == null ? Notification.Status.SKIPPED : Notification.Status.SENDING);
		try {
			notifications.saveAndFlush(n);
		} catch (DataIntegrityViolationException duplicate) {
			log.debug("Email {} already handled (race)", key);
			return;
		}
		if (sender == null) {
			log.info("Email '{}' to {} not sent: mail is turned off", email.subject(), recipient);
			return;
		}
		try {
			MimeMessage message = sender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
			helper.setFrom(app.mail().from());
			helper.setTo(recipient);
			helper.setSubject(email.subject());
			helper.setText(email.text(), email.html());
			sender.send(message);
			n.setStatus(Notification.Status.SENT);
			n.setSentAt(Instant.now());
			log.info("Emailed {} '{}'", recipient, email.subject());
		} catch (Exception e) {
			n.setStatus(Notification.Status.FAILED);
			n.setError(e.getMessage());
			log.warn("Could not email {} '{}': {}", recipient, email.subject(), e.getMessage());
		}
		notifications.save(n);
	}
}
