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
		/** How long before expiry an unpaid order gets one "finish paying" email; zero turns reminders off. */
		Duration paymentReminderBefore,
		String adminEmail,
		String adminPassword,
		String jwtSecret,
		Delivery delivery,
		Mail mail) {

	/** Customer emails: on/off, sender, and the dev inbox link for the admin. */
	public record Mail(boolean enabled, String from, String inboxUrl) {
	}

	/** Flat delivery fee, waived when the cart subtotal reaches freeOver. */
	public record Delivery(java.math.BigDecimal flatFee, java.math.BigDecimal freeOver) {

		public java.math.BigDecimal feeFor(java.math.BigDecimal subtotal) {
			if (flatFee == null || flatFee.signum() <= 0) {
				return java.math.BigDecimal.ZERO.setScale(2);
			}
			return freeOver != null && freeOver.signum() > 0 && subtotal.compareTo(freeOver) >= 0
					? java.math.BigDecimal.ZERO.setScale(2)
					: flatFee.setScale(2, java.math.RoundingMode.HALF_UP);
		}
	}
}
