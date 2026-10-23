package et.tenapay.shop.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(
		String publicBaseUrl,
		/** Public https base (e.g. the ngrok URL) for BillPay's returnUrl/cancelUrl; blank = use publicBaseUrl. */
		String redirectBaseUrl,
		List<String> corsOrigins,
		Duration reconcileAfter,
		Duration paymentExpiry,
		String adminEmail,
		String adminPassword,
		String jwtSecret) {
}
