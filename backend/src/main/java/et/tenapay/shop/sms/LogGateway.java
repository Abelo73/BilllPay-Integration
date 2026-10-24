package et.tenapay.shop.sms;

import lombok.extern.slf4j.Slf4j;

/** Test mode: writes the message to the backend log instead of sending it. Used while no AfroMessage token is set. */
@Slf4j
class LogGateway implements SmsGateway {

	@Override
	public String name() {
		return "log";
	}

	@Override
	public boolean delivers() {
		return false;
	}

	@Override
	public Result send(String to, String text) {
		log.info("[SMS test mode, not sent] to {}: {}", to, text);
		return Result.ok(null);
	}
}
