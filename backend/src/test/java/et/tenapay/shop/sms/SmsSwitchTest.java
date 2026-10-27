package et.tenapay.shop.sms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.config.Features;
import et.tenapay.shop.monitoring.ShopMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import tools.jackson.databind.json.JsonMapper;

/** Admin → Features → "Send real SMS": off means nothing reaches the provider (no credit used), texts are only logged. */
class SmsSwitchTest {

	/** A provider that really delivers, recording what it was asked to send. */
	static class Delivering implements SmsGateway {
		final List<String> sent = new ArrayList<>();

		@Override
		public String name() {
			return "afromessage";
		}

		@Override
		public boolean delivers() {
			return true;
		}

		@Override
		public Result send(String to, String text) {
			sent.add(to);
			return Result.ok("ref-1");
		}
	}

	private SmsService service(Delivering provider, boolean switchOn) {
		SmsMessageRepository repo = mock(SmsMessageRepository.class);
		when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
		SmsService sms = new SmsService(repo, new SmsProperties(null, Duration.ofSeconds(5), false),
				new ShopMetrics(new SimpleMeterRegistry()), JsonMapper.builder().build());
		sms.setGatewayOverride(() -> provider);
		Features features = mock(Features.class);
		when(features.on(Features.SMS_SENDING)).thenReturn(switchOn);
		sms.setFeatures(features);
		return sms;
	}

	@Test
	void switchedOffNothingReachesThePhone() {
		Delivering provider = new Delivering();
		SmsService sms = service(provider, false);
		assertThat(sms.switchedOff()).isTrue();
		assertThat(sms.delivers()).isFalse();
		SmsService.Sent sent = sms.send(SmsService.Kind.ORDER, "+251911223344", "hello", null, null);
		assertThat(sent.ok()).isTrue();
		assertThat(sent.status()).isEqualTo("LOGGED");
		assertThat(provider.sent).isEmpty();
	}

	@Test
	void switchedOnTheProviderSends() {
		Delivering provider = new Delivering();
		SmsService sms = service(provider, true);
		assertThat(sms.switchedOff()).isFalse();
		SmsService.Sent sent = sms.send(SmsService.Kind.ORDER, "+251911223344", "hello", null, null);
		assertThat(sent.status()).isEqualTo("SENT");
		assertThat(provider.sent).containsExactly("+251911223344");
	}
}
