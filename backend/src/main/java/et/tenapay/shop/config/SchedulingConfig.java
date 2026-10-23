package et.tenapay.shop.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Background jobs (reconciliation, expiry, webhook sweeper). On by default; integration tests turn them off with
 * {@code app.scheduling.enabled=false} and call the jobs directly, so timing never makes a test flaky.
 */
@Configuration
@EnableScheduling
@ConditionalOnBooleanProperty(name = "app.scheduling.enabled", matchIfMissing = true)
public class SchedulingConfig {
}
