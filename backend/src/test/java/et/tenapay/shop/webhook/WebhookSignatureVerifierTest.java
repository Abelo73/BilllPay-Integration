package et.tenapay.shop.webhook;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.payment.billpay.BillPayProperties;
import et.tenapay.shop.payment.billpay.BillPayProperties.Credentials;
import et.tenapay.shop.payment.billpay.BillPayProperties.Verification;
import et.tenapay.shop.webhook.WebhookSignatureVerifier.Result;

class WebhookSignatureVerifierTest {

	private static final String BODY = "{\"paymentId\":\"pay_1\",\"status\":\"PAID\"}";

	private static WebhookSignatureVerifier verifier(Verification mode, String sandboxSecret, String liveSecret) {
		return new WebhookSignatureVerifier(new BillPayProperties(BillPayEnvironment.SANDBOX,
				new Credentials("https://sandbox.api.billpay.et", "key", sandboxSecret),
				new Credentials("https://api.billpay.et", "live-key", liveSecret), "/c", "/s/{id}", "/r",
				Duration.ofSeconds(5), new BillPayProperties.Webhook(mode, "X-BillPay-Signature")));
	}

	private static WebhookSignatureVerifier verifier(Verification mode, String secret) {
		return verifier(mode, secret, "");
	}

	private static byte[] mac(String secret, String data) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
	}

	private static byte[] mac(String data) throws Exception {
		return mac("s3cret", data);
	}

	@Test
	void acceptsHexOrBase64HmacInAnyHeaderCase() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.HMAC_SHA256, "s3cret");
		assertThat(v.verify(BODY, Map.of("x-billpay-signature", "sha256=" + HexFormat.of().formatHex(mac(BODY)))).result())
				.isEqualTo(Result.VALID);
		assertThat(v.verify(BODY, Map.of("X-BillPay-Signature", Base64.getEncoder().encodeToString(mac(BODY)))).result())
				.isEqualTo(Result.VALID);
	}

	@Test
	void acceptsTimestampedFormat() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.HMAC_SHA256, "s3cret");
		String header = "t=1792692378,v1=" + HexFormat.of().formatHex(mac("1792692378." + BODY));
		assertThat(v.verify(BODY, Map.of("X-BillPay-Signature", header)).result()).isEqualTo(Result.VALID);
	}

	@Test
	void rejectsTamperedBodyOrMissingHeader() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.HMAC_SHA256, "s3cret");
		assertThat(v.verify(BODY.replace("PAID", "FAILED"),
				Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac(BODY)))).result()).isEqualTo(Result.INVALID);
		assertThat(v.verify(BODY, Map.of()).result()).isEqualTo(Result.INVALID);
	}

	@Test
	void probeDetectsSchemeWithoutEnforcing() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.NONE, "s3cret");
		var outcome = v.verify(BODY, Map.of("X-Webhook-Signature", HexFormat.of().formatHex(mac(BODY))));
		assertThat(outcome.result()).isEqualTo(Result.NOT_CHECKED);
		assertThat(outcome.scheme()).contains("X-Webhook-Signature").contains("raw body");
		assertThat(outcome.environment()).isNull();

		assertThat(v.verify(BODY, Map.of("X-Webhook-Signature", "nope")).scheme()).isEqualTo("probe: no match");
		assertThat(verifier(Verification.NONE, "").verify(BODY, Map.of()).scheme()).isNull();
	}

	/** The secret that matches tells which BillPay sent the event, so sandbox events can't touch live payments. */
	@Test
	void reportsWhichEnvironmentSigned() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.HMAC_SHA256, "sandbox-secret", "live-secret");
		var live = v.verify(BODY, Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac("live-secret", BODY))));
		assertThat(live.result()).isEqualTo(Result.VALID);
		assertThat(live.environment()).isEqualTo(BillPayEnvironment.LIVE);
		var sandbox = v.verify(BODY, Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac("sandbox-secret", BODY))));
		assertThat(sandbox.result()).isEqualTo(Result.VALID);
		assertThat(sandbox.environment()).isEqualTo(BillPayEnvironment.SANDBOX);
		assertThat(v.verify(BODY, Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac("other", BODY)))).result())
				.isEqualTo(Result.INVALID);
	}

	/** The same secret pasted into both lines can't prove an event is live, so it never counts as live. */
	@Test
	void identicalSecretsNeverCountAsLive() throws Exception {
		WebhookSignatureVerifier v = verifier(Verification.HMAC_SHA256, "same-secret", "same-secret");
		var outcome = v.verify(BODY, Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac("same-secret", BODY))));
		assertThat(outcome.result()).isEqualTo(Result.VALID);
		assertThat(outcome.environment()).isEqualTo(BillPayEnvironment.SANDBOX);
	}
}
