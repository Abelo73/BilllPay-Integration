package et.tenapay.shop.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(
		String publicBaseUrl,
		List<String> corsOrigins,
		Duration reconcileAfter,
		Duration paymentExpiry,
		String adminUsername,
		String adminPassword,
		String jwtSecret) {
}
