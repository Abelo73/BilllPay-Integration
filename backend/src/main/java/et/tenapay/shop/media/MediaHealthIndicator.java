package et.tenapay.shop.media;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** Shows the photo store in /actuator/health as "media". */
@Component("media")
@RequiredArgsConstructor
public class MediaHealthIndicator implements HealthIndicator {

	private final MediaStorage storage;

	@Override
	public Health health() {
		return storage.isAvailable() ? Health.up().build() : Health.down().withDetail("reason", "bucket unreachable").build();
	}
}
