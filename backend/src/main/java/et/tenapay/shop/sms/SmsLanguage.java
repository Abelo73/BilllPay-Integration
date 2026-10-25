package et.tenapay.shop.sms;

import java.util.UUID;

import org.springframework.stereotype.Service;

import et.tenapay.shop.user.UserRepository;

/**
 * Picks the English or Amharic text of an SMS from the person's site language (Sodo Gebeya M18).
 * Amharic texts use Unicode, so one SMS part holds 70 characters instead of 160: keep them short.
 *
 * <pre>sms.send(kind, phone, lang.pick(userId, "Your order is on the way.", "ትዕዛዝዎ በመንገድ ላይ ነው።"), null, null);</pre>
 */
@Service
public class SmsLanguage {

	public static final String ENGLISH = "en";
	public static final String AMHARIC = "am";

	private final UserRepository users;

	public SmsLanguage(UserRepository users) {
		this.users = users;
	}

	/** "en" or "am"; unknown people (guests) get English. */
	public String of(UUID userId) {
		if (userId == null) {
			return ENGLISH;
		}
		try {
			return users.findById(userId).map(u -> normalize(u.getLanguage())).orElse(ENGLISH);
		} catch (RuntimeException e) {
			return ENGLISH;
		}
	}

	public boolean amharic(UUID userId) {
		return AMHARIC.equals(of(userId));
	}

	public String pick(UUID userId, String english, String amharic) {
		return amharic(userId) ? amharic : english;
	}

	/** Anything other than "am" counts as English. */
	public static String normalize(String language) {
		return language != null && language.trim().toLowerCase().startsWith(AMHARIC) ? AMHARIC : ENGLISH;
	}
}
