package et.tenapay.shop.catalog;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.seller.Shop;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * M23 fraud rules: a listing is held for a staff check (it leaves the store; Admin → Products → "Taken down" shows it
 * and staff put it back) when it looks like a scam. Each rule has a switch or number in Admin → Features → Safety.
 * <ul>
 * <li>several different shoppers reported it within a week;</li>
 * <li>a new, unverified shop lists it far below the usual price of its category;</li>
 * <li>it asks for money up front ("send money first", "advance payment", ...).</li>
 * </ul>
 * New shops also can't add more than a set number of listings an hour.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FraudRules {

	public static final String HOLD_PREFIX = "Held for a check: ";
	static final Duration NEW_SHOP = Duration.ofDays(14);

	/** Asking for money before meeting is the most common scam on classifieds sites. */
	static final Pattern SCAM_WORDS = Pattern.compile(
			"(?i)(advance\\s+payment|pay\\s+(first|before|in advance)|send\\s+(the\\s+)?money\\s+(first|before)|deposit\\s+first|transfer\\s+first"
					+ "|western\\s+union|money\\s*gram|gift\\s+card|ቅድሚያ\\s*ክፍያ|ቀድመው\\s*ይክፈሉ|ገንዘብ\\s*ቀድመው)");

	private final ProductRepository products;
	private final CatalogAdminService catalog;
	private final JdbcTemplate jdbc;
	private final Features features;
	private final InboxService inbox;
	private final ShopMetrics metrics;

	/** After a seller saves a listing: hold it if the price or the words look like a scam. */
	public void checkListing(Long productId) {
		Product p = products.findWithCategoryById(productId).orElse(null);
		if (p == null || p.getShop() == null || p.getBlockedReason() != null || !p.isActive()) {
			return;
		}
		String text = (p.getName() + " " + (p.getDescription() == null ? "" : p.getDescription())).toLowerCase(Locale.ROOT);
		if (features.on(Features.AUTO_HOLD_SCAM_WORDS) && SCAM_WORDS.matcher(text).find()) {
			hold(p, "it asks buyers to pay before they see the item. On Sodo Gebeya buyers pay when they meet you or through the site.");
			return;
		}
		if (features.on(Features.AUTO_HOLD_LOW_PRICE) && newUnverified(p.getShop())) {
			BigDecimal usual = median(p);
			if (usual != null && p.getPrice().compareTo(usual.multiply(new BigDecimal("0.35"))) < 0) {
				hold(p, "the price is much lower than similar listings (usually about " + usual.stripTrailingZeros().toPlainString()
						+ " birr). If it's real, we'll put it back after a quick check.");
			}
		}
	}

	/** After a report: several different shoppers in a week hold the listing until staff look. */
	public void checkReports(Long productId) {
		int needed = features.integer(Features.AUTO_HOLD_REPORTS);
		if (needed <= 0) {
			return;
		}
		Integer reporters = jdbc.queryForObject("""
				select count(distinct reporter_id) from listing_reports
				where product_id = ? and created_at > now() - interval '7 days' and status = 'OPEN'
				""", Integer.class, productId);
		if (reporters != null && reporters >= needed) {
			products.findWithCategoryById(productId).filter(p -> p.getBlockedReason() == null)
					.ifPresent(p -> hold(p, reporters + " shoppers reported it. Our team checks it soon."));
		}
	}

	/** Before a new listing: a new shop can add only so many listings an hour (stops bulk scam posting). */
	public void checkBurst(Shop shop) {
		int max = features.integer(Features.NEW_SHOP_HOURLY_LISTINGS);
		if (max <= 0 || shop.getVerifiedAt() != null || !newShop(shop)) {
			return;
		}
		Integer lastHour = jdbc.queryForObject("select count(*) from products where shop_id = ? and created_at > now() - interval '1 hour'",
				Integer.class, shop.getId());
		if (lastHour != null && lastHour >= max) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "SLOW_DOWN",
					"New shops can add " + max + " listings an hour. Please wait a little, or get verified to remove the limit.");
		}
	}

	// ---------- helpers ----------

	private void hold(Product p, String why) {
		catalog.block(p.getId(), HOLD_PREFIX + why);
		metrics.shopEvent("listing_auto_held");
		log.info("Listing #{} held automatically: {}", p.getId(), why);
		Shop shop = p.getShop();
		if (shop != null && shop.getOwnerId() != null) {
			inbox.notify(shop.getOwnerId(), InboxItem.Kind.SHOP, "Your listing is held for a check",
					"\"" + p.getName() + "\" is not shown for now: " + why, "/seller/products/" + p.getId(), "held:" + p.getId() + ":" + Instant.now().getEpochSecond() / 3600);
		}
	}

	/** The usual price in the listing's category: the median of at least 5 other visible listings, else null. */
	private BigDecimal median(Product p) {
		List<BigDecimal> m = jdbc.query("""
				select percentile_cont(0.5) within group (order by price) as median, count(*) as n
				from products where category_id = ? and id <> ? and active and blocked_reason is null
				""", (rs, i) -> rs.getLong("n") >= 5 ? rs.getBigDecimal("median") : null, p.getCategory().getId(), p.getId());
		return m.isEmpty() ? null : m.get(0);
	}

	private static boolean newUnverified(Shop shop) {
		return shop.getVerifiedAt() == null && newShop(shop);
	}

	private static boolean newShop(Shop shop) {
		return shop.getCreatedAt() == null || shop.getCreatedAt().isAfter(Instant.now().minus(NEW_SHOP));
	}
}
