package et.tenapay.shop.catalog;

import java.text.Normalizer;
import java.util.Locale;
import java.util.function.Predicate;

public final class Slugs {

	private Slugs() {
	}

	/** "Handmade Clay Jebena!" → "handmade-clay-jebena". Non-Latin-only names give "" (caller falls back). */
	public static String slugify(String text) {
		if (text == null) {
			return "";
		}
		String ascii = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
		String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
		return slug.length() > 80 ? slug.substring(0, 80).replaceAll("-+$", "") : slug;
	}

	/** Appends -2, -3, … until {@code taken} says the slug is free. */
	public static String unique(String base, String fallback, Predicate<String> taken) {
		String root = base == null || base.isBlank() ? fallback : base;
		String candidate = root;
		for (int n = 2; taken.test(candidate); n++) {
			candidate = root + "-" + n;
		}
		return candidate;
	}
}
