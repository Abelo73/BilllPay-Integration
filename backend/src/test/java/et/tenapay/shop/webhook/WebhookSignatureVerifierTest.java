package et.tenapay.shop.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.payment.billpay.BillPayProperties;
import et.tenapay.shop.payment.billpay.BillPayProperties.Verification;
import et.tenapay.shop.webhook.WebhookSignatureVerifier.Result;

class WebhookSignatureVerifierTest {

	private static final String SANDBOX = "https://sandbox.api.billpay.et";
	private static final String BODY = "{\"paymentId\":\"pay_1\",\"status\":\"PAID\"}";

	private static WebhookSignatureVerifier verifier(String baseUrl, Verification mode, String secret) {
		return new WebhookSignatureVerifier(new BillPayProperties(baseUrl, "key", "/c", "/s/{id}", "/r",
				Duration.ofSeconds(5), new BillPayProperties.Webhook(mode, secret, "X-BillPay-Signature")));
	}

	private static byte[] mac(String data) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec("s3cret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
	}

	@Test
	void acceptsHexOrBase64HmacInAnyHeaderCase() throws Exception {
		WebhookSignatureVerifier v = verifier(SANDBOX, Verification.HMAC_SHA256, "s3cret");
		assertThat(v.verify(BODY, Map.of("x-billpay-signature", "sha256=" + HexFormat.of().formatHex(mac(BODY)))).result())
				.isEqualTo(Result.VALID);
		assertThat(v.verify(BODY, Map.of("X-BillPay-Signature", Base64.getEncoder().encodeToString(mac(BODY)))).result())
				.isEqualTo(Result.VALID);
	}

	@Test
	void acceptsTimestampedFormat() throws Exception {
		WebhookSignatureVerifier v = verifier(SANDBOX, Verification.HMAC_SHA256, "s3cret");
		String header = "t=1792692378,v1=" + HexFormat.of().formatHex(mac("1792692378." + BODY));
		assertThat(v.verify(BODY, Map.of("X-BillPay-Signature", header)).result()).isEqualTo(Result.VALID);
	}

	@Test
	void rejectsTamperedBodyOrMissingHeader() throws Exception {
		WebhookSignatureVerifier v = verifier(SANDBOX, Verification.HMAC_SHA256, "s3cret");
		assertThat(v.verify(BODY.replace("PAID", "FAILED"),
				Map.of("X-BillPay-Signature", HexFormat.of().formatHex(mac(BODY)))).result()).isEqualTo(Result.INVALID);
		assertThat(v.verify(BODY, Map.of()).result()).isEqualTo(Result.INVALID);
	}

	@Test
	void probeDetectsSchemeWithoutEnforcing() throws Exception {
		WebhookSignatureVerifier v = verifier(SANDBOX, Verification.NONE, "s3cret");
		var outcome = v.verify(BODY, Map.of("X-Webhook-Signature", HexFormat.of().formatHex(mac(BODY))));
		assertThat(outcome.result()).isEqualTo(Result.NOT_CHECKED);
		assertThat(outcome.scheme()).contains("X-Webhook-Signature").contains("raw body");

		assertThat(v.verify(BODY, Map.of("X-Webhook-Signature", "nope")).scheme()).isEqualTo("probe: no match");
		assertThat(verifier(SANDBOX, Verification.NONE, "").verify(BODY, Map.of()).scheme()).isNull();
	}

	@Test
	void unsignedModeIsRefusedOutsideSandbox() {
		assertThatThrownBy(() -> verifier("https://api.billpay.et", Verification.NONE, ""))
				.isInstanceOf(IllegalStateException.class);
	}
}
