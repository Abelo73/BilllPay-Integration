package et.tenapay.shop.events;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import et.tenapay.shop.config.KafkaConfig;
import lombok.extern.slf4j.Slf4j;

/** Stand-in for an email/SMS service: shows that order events flow through Kafka. */
@Slf4j
@Component
public class NotificationListener {

	@KafkaListener(topics = KafkaConfig.ORDER_EVENTS, groupId = "tenashop-notifications")
	void onOrderEvent(String message) {
		log.info("[notification stub] would notify customer about: {}", message);
	}
}
