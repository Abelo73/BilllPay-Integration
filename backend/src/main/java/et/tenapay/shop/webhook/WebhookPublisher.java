package et.tenapay.shop.webhook;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.config.KafkaConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Moves stored webhooks onto Kafka. The Kafka message is just the inbox row id; the processor reads the row.
 * A sweeper republishes anything left RECEIVED (e.g. Kafka was down), so no callback is lost.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebhookPublisher {

	private final KafkaTemplate<String, String> kafka;
	private final WebhookEventRepository events;
	private final TransactionTemplate tx;

	public void publish(WebhookEvent event) {
		String key = event.getBillpayPaymentId() != null ? event.getBillpayPaymentId() : String.valueOf(event.getId());
		kafka.send(KafkaConfig.WEBHOOK_EVENTS, key, String.valueOf(event.getId()))
				.whenComplete((r, ex) -> {
					if (ex != null) {
						log.warn("Webhook {} not published yet, sweeper will retry: {}", event.getId(), ex.getMessage());
						return;
					}
					tx.executeWithoutResult(s -> events.findById(event.getId())
							.filter(e -> e.getStatus() == WebhookEvent.Status.RECEIVED)
							.ifPresent(e -> e.setStatus(WebhookEvent.Status.PUBLISHED)));
				});
	}

	@Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT20S")
	public void sweep() {
		List<Long> stuck = events.findStuckReceived(Instant.now().minusSeconds(30), PageRequest.of(0, 100));
		if (!stuck.isEmpty()) {
			log.info("Republishing {} webhook(s) stuck in RECEIVED", stuck.size());
		}
		stuck.forEach(id -> events.findById(id).ifPresent(this::publish));
	}
}
