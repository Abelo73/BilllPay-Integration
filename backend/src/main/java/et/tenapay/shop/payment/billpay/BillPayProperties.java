package et.tenapay.shop.payment.billpay;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("billpay")
public record BillPayProperties(
		String baseUrl,
		String apiKey,
		String createPaymentPath,
		String paymentStatusPath,
		String refundPath,
		Duration timeout,
		Webhook webhook) {

	public enum Verification { NONE, HMAC_SHA256 }

	public record Webhook(Verification verification, String secret, String signatureHeader) {
	}

	public boolean isSandbox() {
		return baseUrl.contains("sandbox");
	}
}
