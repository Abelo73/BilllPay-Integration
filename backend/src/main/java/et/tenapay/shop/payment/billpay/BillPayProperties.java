package et.tenapay.shop.payment.billpay;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * BillPay settings. Sandbox and live each have their own URL, API key and webhook secret (all from .env); which one
 * new payments use is the mode, picked by an admin in Admin → BillPay setup ({@link BillPayMode}).
 */
@ConfigurationProperties("billpay")
public record BillPayProperties(
		/** Mode used until an admin picks one in the dashboard. */
		BillPayEnvironment mode,
		Credentials sandbox,
		Credentials live,
		String createPaymentPath,
		String paymentStatusPath,
		String refundPath,
		Duration timeout,
		Webhook webhook) {

	public enum Verification { NONE, HMAC_SHA256 }

	public record Credentials(String baseUrl, String apiKey, String webhookSecret) {

		public boolean hasApiKey() {
			return apiKey != null && !apiKey.isBlank();
		}

		public boolean hasWebhookSecret() {
			return webhookSecret != null && !webhookSecret.isBlank();
		}
	}

	public record Webhook(Verification verification, String signatureHeader) {
	}

	public Credentials credentials(BillPayEnvironment env) {
		return env == BillPayEnvironment.LIVE ? live : sandbox;
	}
}
