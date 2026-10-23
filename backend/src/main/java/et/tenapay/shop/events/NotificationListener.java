package et.tenapay.shop.events;

import java.time.Instant;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import et.tenapay.shop.config.KafkaConfig;
import et.tenapay.shop.notification.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Turns order events into customer emails. Its own consumer group, so it never slows down payments. */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationListener {

	private final NotificationService notifications;
	private final ObjectMapper json;

	@KafkaListener(topics = KafkaConfig.ORDER_EVENTS, groupId = "tenashop-notifications")
	void onOrderEvent(String message) {
		JsonNode m = json.readTree(message);
		String occurred = m.path("occurredAt").asString(null);
		notifications.onOrderEvent(m.path("type").asString(null), m.path("orderNumber").asString(null),
				occurred == null ? null : Instant.parse(occurred));
	}
}
