package et.tenapay.shop.sms;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import et.tenapay.shop.monitoring.ShopMetrics;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/**
 * Sends text messages and keeps a record of each in {@code sms_messages}. Uses AfroMessage when {@code sms.afromessage.token}
 * is set, otherwise test mode (logged, never sent). Never throws: a failed SMS is recorded as FAILED.
 */
@Slf4j
@Service
public class SmsService {

	/** What a message is for; stored with it and used for metrics. */
	public enum Kind { SIGN_IN_CODE, ORDER, PAYMENT, DELIVERY, JOB, CHAT, OTHER }

	public record Sent(boolean ok, String status, String error) {
	}

	private final SmsMessageRepository messages;
	private final SmsProperties props;
	private final ShopMetrics metrics;
	private SmsGateway gateway;

	public SmsService(SmsMessageRepository messages, SmsProperties props, ShopMetrics metrics, ObjectMapper json) {
		this.messages = messages;
		this.props = props;
		this.metrics = metrics;
		this.gateway = props.afroMessageConfigured() ? new AfroMessageGateway(props, json) : new LogGateway();
		log.info("SMS: {}", gateway.delivers() ? "AfroMessage" : "test mode (messages are logged, not sent)");
	}

	/** Tests swap in a fake gateway. */
	@Autowired(required = false)
	void setGatewayOverride(SmsGatewayOverride override) {
		if (override != null) {
			this.gateway = override.gateway();
		}
	}

	/** Lets tests replace the gateway without touching production wiring. */
	public interface SmsGatewayOverride {
		SmsGateway gateway();
	}

	public boolean delivers() {
		return gateway.delivers();
	}

	public String providerName() {
		return gateway.name();
	}

	public SmsProperties properties() {
		return props;
	}

	/**
	 * Sends {@code text} to {@code to}. {@code storedText} is what goes into the log table (pass a masked copy for codes);
	 * null stores the text as sent.
	 */
	public Sent send(Kind kind, String to, String text, String storedText, String orderNumber) {
		SmsGateway.Result result = gateway.send(to, text);
		SmsMessage m = new SmsMessage();
		m.setKind(kind.name());
		m.setRecipient(to);
		String stored = storedText != null ? storedText : text;
		m.setBody(stored.length() > 480 ? stored.substring(0, 480) : stored);
		m.setProvider(gateway.name());
		m.setOrderNumber(orderNumber);
		m.setProviderRef(result.providerRef());
		m.setError(result.error());
		m.setStatus(!result.sent() ? SmsMessage.Status.FAILED
				: gateway.delivers() ? SmsMessage.Status.SENT : SmsMessage.Status.LOGGED);
		try {
			messages.save(m);
		} catch (RuntimeException e) {
			log.warn("Could not record SMS to {}: {}", to, e.getMessage());
		}
		metrics.sms(kind.name(), m.getStatus().name());
		if (!result.sent()) {
			log.warn("SMS {} to {} failed: {}", kind, to, result.error());
		}
		return new Sent(result.sent(), m.getStatus().name(), result.error());
	}
}
