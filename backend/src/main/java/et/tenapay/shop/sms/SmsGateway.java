package et.tenapay.shop.sms;

/** Something that can deliver a text message. AfroMessage in production; a logger in test mode. */
public interface SmsGateway {

	/** What the gateway did. {@code sent=false} with an error means the provider refused or could not be reached. */
	record Result(boolean sent, String providerRef, String error) {

		static Result ok(String ref) {
			return new Result(true, ref, null);
		}

		static Result failed(String error) {
			return new Result(false, null, error);
		}
	}

	/** Short name stored with each message: "afromessage" or "log". */
	String name();

	/** True when messages really reach phones. */
	boolean delivers();

	/** {@code to} is an international number such as +251911234567. Never throws. */
	Result send(String to, String text);
}
