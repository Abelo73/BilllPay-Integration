package et.tenapay.shop.inbox;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.KafkaConfig;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderItem;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.seller.ShopRepository;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Order events → in-app notifications: for the buyer (paid, failed, on the way, delivered, reminder, expired, cancelled,
 * refunded) and for each shop in a paid order ("New order to pack"). Own Kafka group; like the SMS listener it starts at
 * the newest event so turning it on doesn't flood people with old news.
 */
@Slf4j
@Component
public class InboxOrderNotifier {

	private final InboxService inbox;
	private final OrderRepository orders;
	private final ShopRepository shops;
	private final TransactionTemplate tx;
	private final ObjectMapper json;

	public InboxOrderNotifier(InboxService inbox, OrderRepository orders, ShopRepository shops, TransactionTemplate tx,
			ObjectMapper json) {
		this.inbox = inbox;
		this.orders = orders;
		this.shops = shops;
		this.tx = tx;
		this.json = json;
	}

	private record Info(String number, UUID buyer, Set<UUID> shopOwners) {
	}

	@KafkaListener(topics = KafkaConfig.ORDER_EVENTS, groupId = "tenashop-inbox",
			properties = "auto.offset.reset=${sms.kafka-offset-reset:latest}")
	void onEvent(String message) {
		JsonNode m = json.readTree(message);
		String type = m.path("type").asString(null);
		String number = m.path("orderNumber").asString(null);
		String occurred = m.path("occurredAt").asString("");
		if (type == null || number == null) {
			return;
		}
		Optional<Info> info = tx.execute(s -> orders.findByOrderNumber(number).map(this::info));
		if (info == null || info.isEmpty()) {
			return;
		}
		Info o = info.get();
		String link = "/orders/track?order=" + number;
		String key = "INBOX:" + type + ":" + number + ":" + occurred;
		switch (type) {
			case "order.paid", "order.review.resolved" -> {
				inbox.notify(o.buyer(), InboxItem.Kind.PAYMENT, "Payment received", "Order " + number + " is paid. We'll tell you when it's on the way.", link, key);
				for (UUID owner : o.shopOwners()) {
					inbox.notify(owner, InboxItem.Kind.SHOP, "New order to pack", "Order " + number + " is paid. Pack it and mark it ready.", "/seller", key + ":" + owner);
				}
			}
			case "order.payment.failed" -> inbox.notify(o.buyer(), InboxItem.Kind.PAYMENT, "Payment didn't go through",
					"Your items are still held. Try again with another number or method.", link, key);
			case "order.payment.reminder" -> inbox.notify(o.buyer(), InboxItem.Kind.PAYMENT, "Finish paying",
					"Order " + number + " is waiting for payment. Pay soon or the items are released.", link, "INBOX:REMINDER:" + number);
			case "order.fulfilment.shipped" -> inbox.notify(o.buyer(), InboxItem.Kind.DELIVERY, "Your order is on the way",
					"Order " + number + " left the shop.", link, key);
			case "order.fulfilment.delivered" -> inbox.notify(o.buyer(), InboxItem.Kind.DELIVERY, "Delivered",
					"Order " + number + " was delivered. Tell others what you think: rate your items.", "/account", key);
			case "order.expired" -> inbox.notify(o.buyer(), InboxItem.Kind.ORDER, "Payment window closed",
					"Order " + number + " was released. You can order the items again.", link, key);
			case "order.cancelled", "order.fulfilment.cancelled" -> inbox.notify(o.buyer(), InboxItem.Kind.ORDER, "Order cancelled",
					"Order " + number + " was cancelled.", link, key);
			case "order.refunded", "order.partially.refunded" -> inbox.notify(o.buyer(), InboxItem.Kind.PAYMENT, "Refund sent",
					"A refund for order " + number + " was sent through BillPay.", link, key);
			default -> {
			}
		}
	}

	private Info info(Order o) {
		Set<UUID> owners = new LinkedHashSet<>();
		for (OrderItem i : o.getItems()) {
			if (i.getShopId() != null) {
				shops.findById(i.getShopId()).ifPresent(s -> owners.add(s.getOwnerId()));
			}
		}
		return new Info(o.getOrderNumber(), o.getUserId(), owners);
	}

	/** Daily housekeeping: notifications older than 90 days go. */
	@Scheduled(cron = "0 30 3 * * *", zone = "Africa/Addis_Ababa")
	public void cleanUp() {
		int n = inbox.cleanUp();
		if (n > 0) {
			log.info("Removed {} old notifications", n);
		}
	}

	/** For tests: the same as a Kafka message. */
	public void handle(String message) {
		onEvent(message);
	}

}
