package et.tenapay.shop.events;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.config.KafkaConfig;
import et.tenapay.shop.order.Order;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/** Publishes order lifecycle events (order.created, order.paid, ...) to Kafka after the DB commit. */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventPublisher {

	private final KafkaTemplate<String, String> kafka;
	private final ObjectMapper json;

	public record OrderMessage(String type, String orderNumber, String status, BigDecimal total, String currency,
			String customerEmail, Map<String, Object> detail, Instant occurredAt) {
	}

	public void publish(Order order, String type, Map<String, Object> detail) {
		OrderMessage message = new OrderMessage(type, order.getOrderNumber(), order.getStatus().name(),
				order.getTotal(), order.getCurrency(), order.getCustomerEmail(), detail, Instant.now());
		String payload = json.writeValueAsString(message);
		AfterCommit.run(() -> kafka.send(KafkaConfig.ORDER_EVENTS, message.orderNumber(), payload)
				.whenComplete((r, ex) -> {
					if (ex != null) {
						// The order_events table still has the full history; Kafka is only the transport.
						log.warn("Could not publish {} for {}: {}", type, message.orderNumber(), ex.getMessage());
					}
				}));
	}
}
