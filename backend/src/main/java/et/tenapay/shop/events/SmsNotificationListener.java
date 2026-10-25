package et.tenapay.shop.events;

import java.time.Instant;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import et.tenapay.shop.config.KafkaConfig;
import et.tenapay.shop.sms.SmsOrderNotifier;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Turns order events into SMS updates. Its own consumer group, so slow SMS never delays emails or payments. */
@Component
@RequiredArgsConstructor
public class SmsNotificationListener {

	private final SmsOrderNotifier notifier;
	private final ObjectMapper json;

	// A new group starts at the newest event (not the shop's default "earliest"): when SMS is switched on, customers
	// must not get texts about old orders. Tests use "earliest" so no event is missed while the group joins.
	@KafkaListener(topics = KafkaConfig.ORDER_EVENTS, groupId = "tenashop-sms",
			properties = "auto.offset.reset=${sms.kafka-offset-reset:latest}")
	void onOrderEvent(String message) {
		JsonNode m = json.readTree(message);
		String occurred = m.path("occurredAt").asString(null);
		// split orders: fulfilment events come once per parcel, with the seller name
		String seller = m.path("detail").hasNonNull("parcel") ? m.path("detail").path("seller").asString("") : null;
		notifier.onOrderEvent(m.path("type").asString(null), m.path("orderNumber").asString(null),
				occurred == null ? null : Instant.parse(occurred), seller);
	}
}
