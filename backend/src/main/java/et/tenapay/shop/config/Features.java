package et.tenapay.shop.config;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import lombok.extern.slf4j.Slf4j;

/**
 * ON/OFF switches and prices that staff change in Admin → Features (no restart). Defaults live here; only values
 * staff changed are stored, in app_settings under "feature.&lt;key&gt;".
 */
@Slf4j
@Service
public class Features {

	public enum Type { SWITCH, NUMBER, TEXT }

	/** One setting: its default, how the admin shows it, and whether shoppers may read it. */
	public record Def(String key, Type type, String defaultValue, String group, String label, String help, boolean shownToShoppers) {
	}

	// Marketplace
	public static final String ONLINE_PAYMENTS = "online_payments";
	public static final String SHOW_SELLER_PHONE = "show_seller_phone";
	public static final String SUPPORT_PHONE = "support_phone";
	// Jobs and CVs (J1–J7)
	public static final String TALENT_PROFILES = "talent_profiles";
	public static final String PROFILE_PUBLIC_DEFAULT = "profile_public_default";
	public static final String AUTO_CV = "auto_cv";
	public static final String JOB_POSTS = "job_posts";
	public static final String JOB_POST_PRICE = "job_post_price";
	public static final String FEATURED_JOB_PRICE = "featured_job_price";
	public static final String FREE_FIRST_POST = "free_first_post";
	public static final String ONE_TAP_APPLY = "one_tap_apply";
	public static final String MAX_APPLICATIONS_PER_DAY = "max_applications_per_day";
	public static final String CV_SERVICE = "cv_service";
	public static final String CV_BASIC_PRICE = "cv_basic_price";
	public static final String CV_COVER_PRICE = "cv_cover_price";
	public static final String CV_PREMIUM_PRICE = "cv_premium_price";
	public static final String CV_EXPRESS_FEE = "cv_express_fee";
	public static final String STUDENT_DISCOUNT = "student_discount";
	public static final String MAX_OPEN_CV_ORDERS = "max_open_cv_orders";
	public static final String FEATURED_TALENT = "featured_talent";
	public static final String FEATURED_TALENT_PRICE = "featured_talent_price";
	public static final String STUDENT_BADGE = "student_badge";

	public static final String BOOSTS = "boosts";
	public static final String BOOST_PRICE_3 = "boost_price_3d";
	public static final String BOOST_PRICE_7 = "boost_price_7d";
	public static final String BOOST_PRICE_14 = "boost_price_14d";
	public static final String PRO_PLAN = "pro_plan";
	public static final String PRO_PLAN_PRICE = "pro_plan_price";
	public static final String FREE_PLAN_MAX_PRODUCTS = "free_plan_max_products";
	public static final String PRO_COMMISSION_OFF = "pro_commission_off";
	public static final String BANNERS = "banners";
	public static final String STAFF_TWO_STEP = "staff_two_step";

	public static final List<Def> DEFS = List.of(
			new Def(ONLINE_PAYMENTS, Type.SWITCH, "false", "Marketplace", "Online payment (BillPay)",
					"On: buyers add to cart and pay online, the money is held until delivery. Off: like Jiji, buyers contact the seller (chat or call) and agree on payment and pickup themselves.", true),
			new Def(SHOW_SELLER_PHONE, Type.SWITCH, "true", "Marketplace", "Show the seller's phone",
					"Signed-in buyers can reveal a seller's phone number to call or message them.", true),
			new Def(SUPPORT_PHONE, Type.TEXT, "", "Marketplace", "Sodo Gebeya phone",
					"Shown to buyers of items sold by Sodo Gebeya itself, and for help.", true),

			new Def(TALENT_PROFILES, Type.SWITCH, "true", "Jobs and CVs", "J1 · Talent profiles",
					"Students, graduates and job seekers make a free profile.", true),
			new Def(PROFILE_PUBLIC_DEFAULT, Type.SWITCH, "false", "Jobs and CVs", "New profiles are public",
					"Off: a new profile is private until the person makes it public.", false),
			new Def(AUTO_CV, Type.SWITCH, "true", "Jobs and CVs", "J2 · Free CV from the profile",
					"\"Download my CV\": a one-page CV made from the profile.", true),
			new Def(JOB_POSTS, Type.SWITCH, "true", "Jobs and CVs", "J3 · Job posts",
					"Shops, offices, schools and NGOs post jobs; staff check each post before it goes live.", true),
			new Def(JOB_POST_PRICE, Type.NUMBER, "199", "Jobs and CVs", "Job post price (birr, 30 days)", "After the first free post.", true),
			new Def(FEATURED_JOB_PRICE, Type.NUMBER, "150", "Jobs and CVs", "Featured job price (birr)", "Top of the jobs page.", true),
			new Def(FREE_FIRST_POST, Type.SWITCH, "true", "Jobs and CVs", "First job post free", null, true),
			new Def(ONE_TAP_APPLY, Type.SWITCH, "true", "Jobs and CVs", "J4 · Apply with my CV", "Job seekers apply in one tap.", true),
			new Def(MAX_APPLICATIONS_PER_DAY, Type.NUMBER, "10", "Jobs and CVs", "Applications a day per person", "Stops spam to employers.", true),
			new Def(CV_SERVICE, Type.SWITCH, "true", "Jobs and CVs", "J5 · Professional CV service", "Our team writes the CV.", true),
			new Def(CV_BASIC_PRICE, Type.NUMBER, "199", "Jobs and CVs", "Basic CV (birr)", null, true),
			new Def(CV_COVER_PRICE, Type.NUMBER, "349", "Jobs and CVs", "CV + cover letter (birr)", null, true),
			new Def(CV_PREMIUM_PRICE, Type.NUMBER, "499", "Jobs and CVs", "Premium CV (birr)", null, true),
			new Def(CV_EXPRESS_FEE, Type.NUMBER, "100", "Jobs and CVs", "Express 24 h (birr extra)", null, true),
			new Def(STUDENT_DISCOUNT, Type.NUMBER, "20", "Jobs and CVs", "Verified student discount (%)", null, true),
			new Def(MAX_OPEN_CV_ORDERS, Type.NUMBER, "30", "Jobs and CVs", "Open CV orders at most",
					"New orders pause when the writers are this busy.", false),
			new Def(FEATURED_TALENT, Type.SWITCH, "false", "Jobs and CVs", "J6 · Featured talent",
					"Profiles shown first to employers. Turn on once there are 30+ active employers.", true),
			new Def(FEATURED_TALENT_PRICE, Type.NUMBER, "49", "Jobs and CVs", "Featured talent (birr a month)", null, true),
			new Def(STUDENT_BADGE, Type.SWITCH, "true", "Jobs and CVs", "J7 · Verified student badge",
					"Students upload their student ID; staff check it.", true),
			new Def(BOOSTS, Type.SWITCH, "true", "Selling", "M16 · Boosts", "Sellers pay to put a listing on top of search and the home page.", true),
			new Def(BOOST_PRICE_3, Type.NUMBER, "50", "Selling", "Boost 3 days (birr)", null, true),
			new Def(BOOST_PRICE_7, Type.NUMBER, "100", "Selling", "Boost 7 days (birr)", null, true),
			new Def(BOOST_PRICE_14, Type.NUMBER, "180", "Selling", "Boost 14 days (birr)", null, true),
			new Def(PRO_PLAN, Type.SWITCH, "true", "Selling", "M17 · Pro shop plan",
					"Monthly plan: no product limit, Pro badge, statistics, lower commission.", true),
			new Def(PRO_PLAN_PRICE, Type.NUMBER, "500", "Selling", "Pro shop (birr a month)", null, true),
			new Def(FREE_PLAN_MAX_PRODUCTS, Type.NUMBER, "20", "Selling", "Products on the free plan",
					"Listings a free shop can have; Pro shops have no limit.", true),
			new Def(PRO_COMMISSION_OFF, Type.NUMBER, "2", "Selling", "Pro shops pay less commission (points)",
					"Taken off the commission percent, e.g. 5% becomes 3%.", true),
			new Def(BANNERS, Type.SWITCH, "true", "Selling", "Home page banners", "Banners from Admin → Banners.", true),
			new Def(STAFF_TWO_STEP, Type.SWITCH, "false", "Security", "2-step sign-in for staff",
					"After the password, staff type a code sent by SMS and email. Check that SMS or email works first.", false));

	private static final Map<String, Def> BY_KEY = new LinkedHashMap<>();
	static {
		DEFS.forEach(d -> BY_KEY.put(d.key(), d));
	}

	private final JdbcTemplate jdbc;
	private final Map<String, String> values = new ConcurrentHashMap<>();
	private volatile Instant loadedAt = Instant.EPOCH;

	public Features(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public boolean on(String key) {
		return Boolean.parseBoolean(value(key));
	}

	public BigDecimal number(String key) {
		return new BigDecimal(value(key));
	}

	public int integer(String key) {
		return number(key).intValue();
	}

	public String text(String key) {
		return value(key);
	}

	/** Refuses with 404 FEATURE_OFF when a switched-off feature is used. */
	public void require(String key) {
		if (!on(key)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "FEATURE_OFF", "This isn't available right now.", Map.of("feature", key));
		}
	}

	public String value(String key) {
		Def d = BY_KEY.get(key);
		if (d == null) {
			throw new IllegalArgumentException("Unknown feature " + key);
		}
		refreshIfStale();
		return values.getOrDefault(key, d.defaultValue());
	}

	/** Every setting with its current value (shoppersOnly: only the ones the store may read). */
	public Map<String, String> all(boolean shoppersOnly) {
		Map<String, String> out = new LinkedHashMap<>();
		DEFS.stream().filter(d -> !shoppersOnly || d.shownToShoppers()).forEach(d -> out.put(d.key(), value(d.key())));
		return out;
	}

	public void set(String key, String raw, String by) {
		Def d = BY_KEY.get(key);
		if (d == null) {
			throw ApiException.notFound("Setting");
		}
		String v = raw == null ? "" : raw.trim();
		switch (d.type()) {
			case SWITCH -> {
				if (!v.equals("true") && !v.equals("false")) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_VALUE", "Use on or off.");
				}
			}
			case NUMBER -> {
				try {
					if (new BigDecimal(v).signum() < 0) {
						throw new NumberFormatException();
					}
				} catch (NumberFormatException e) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_VALUE", "Enter a number, 0 or more.");
				}
			}
			case TEXT -> {
				if (v.length() > 200) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_VALUE", "Keep it under 200 characters.");
				}
			}
		}
		jdbc.update("""
				insert into app_settings (key, value, updated_at, updated_by) values (?, ?, ?, ?)
				on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
				""", "feature." + key, v, Timestamp.from(Instant.now()), by);
		values.put(key, v);
		log.info("Feature {} = {} by {}", key, v, by);
	}

	/** Several app instances could share the database, so stored values are re-read every 30 seconds. */
	private void refreshIfStale() {
		if (loadedAt.isAfter(Instant.now().minusSeconds(30))) {
			return;
		}
		Map<String, String> fresh = new ConcurrentHashMap<>();
		jdbc.query("select key, value from app_settings where key like 'feature.%'",
				rs -> { fresh.put(rs.getString(1).substring("feature.".length()), rs.getString(2)); });
		values.clear();
		values.putAll(fresh);
		loadedAt = Instant.now();
	}

	public static Def def(String key) {
		return BY_KEY.get(key);
	}
}
