package et.tenapay.shop.sms;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/** Reading AfroMessage's replies (no network). */
class AfroMessageGatewayTest {

	private final AfroMessageGateway gateway = new AfroMessageGateway(
			new SmsProperties(new SmsProperties.AfroMessage("https://api.afromessage.com", "token", "id", "SodoGebeya", null),
					Duration.ofSeconds(5), false),
			JsonMapper.builder().build());

	@Test
	void successCarriesTheMessageId() {
		SmsGateway.Result r = gateway.parse("""
				{"acknowledge":"success","response":{"status":"Send in progress","message_id":"abc-123","to":"+251911234567"}}""");
		assertThat(r.sent()).isTrue();
		assertThat(r.providerRef()).isEqualTo("abc-123");
	}

	@Test
	void errorKeepsTheFirstReason() {
		SmsGateway.Result r = gateway.parse("""
				{"acknowledge":"error","response":{"errors":["Insufficient balance"]}}""");
		assertThat(r.sent()).isFalse();
		assertThat(r.error()).isEqualTo("Insufficient balance");
	}

	@Test
	void junkIsAFailureNotACrash() {
		assertThat(gateway.parse("<html>502 Bad Gateway</html>").sent()).isFalse();
		assertThat(gateway.parse("").sent()).isFalse();
	}

	@Test
	void testModeTellsItDoesNotDeliver() {
		assertThat(new LogGateway().delivers()).isFalse();
		assertThat(new LogGateway().send("+251911234567", "hi").sent()).isTrue();
	}
}
