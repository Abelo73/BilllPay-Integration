package et.tenapay.shop.search;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.Category;
import et.tenapay.shop.catalog.CategoryRepository;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.catalog.SpecsService;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * M9 saved searches: a shopper saves the shop page's search (words, category, details, price range). Every 15 minutes,
 * new listings that match go to their inbox (which also reaches Telegram when linked) and, if they chose SMS, one SMS
 * a day per search at most.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SavedSearchService {

	static final int MAX_PER_USER = 10;
	static final Duration SMS_GAP = Duration.ofHours(24);

	private final SavedSearchRepository searches;
	private final ProductRepository products;
	private final CategoryRepository categories;
	private final SpecsService specs;
	private final InboxService inbox;
	private final SmsService sms;
	private final UserRepository users;
	private final TransactionTemplate tx;

	public record Form(String name, String q, String category, Map<String, String> specs, BigDecimal minPrice, BigDecimal maxPrice,
			Boolean alertInbox, Boolean alertSms) {
	}

	public SavedSearch create(UUID userId, Form f) {
		if (searches.countByUserId(userId) >= MAX_PER_USER) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_SEARCHES", "You can save up to " + MAX_PER_USER + " searches. Delete one first.");
		}
		String q = blank(f.q()) ? null : cut(f.q(), 120);
		Category cat = blank(f.category()) ? null
				: categories.findBySlug(f.category().trim()).filter(Category::isActive)
						.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "CATEGORY_INVALID", "That category doesn't exist."));
		if (q == null && cat == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "SEARCH_EMPTY", "Search for something or pick a category first.");
		}
		if (f.minPrice() != null && f.maxPrice() != null && f.minPrice().compareTo(f.maxPrice()) > 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "PRICE_INVALID", "The lowest price can't be more than the highest.");
		}
		String specJson = cat == null || f.specs() == null || f.specs().isEmpty() ? null : specs.filterJson(cat.getId(), f.specs());
		return tx.execute(s -> {
			SavedSearch x = new SavedSearch();
			x.setUserId(userId);
			x.setName(blank(f.name()) ? defaultName(q, cat, f.specs()) : cut(f.name(), 80));
			x.setQ(q);
			x.setCategorySlug(cat == null ? null : cat.getSlug());
			x.setSpecs(specJson == null ? "{}" : specJson);
			x.setMinPrice(positive(f.minPrice()));
			x.setMaxPrice(positive(f.maxPrice()));
			x.setAlertInbox(f.alertInbox() == null || f.alertInbox());
			x.setAlertSms(Boolean.TRUE.equals(f.alertSms()));
			x.setLastSeenProductId(products.maxId());
			return searches.save(x);
		});
	}

	public SavedSearch update(UUID userId, Long id, String name, Boolean alertInbox, Boolean alertSms) {
		return tx.execute(s -> {
			SavedSearch x = own(userId, id);
			if (!blank(name)) {
				x.setName(cut(name, 80));
			}
			if (alertInbox != null) {
				x.setAlertInbox(alertInbox);
			}
			if (alertSms != null) {
				x.setAlertSms(alertSms);
			}
			return x;
		});
	}

	public void delete(UUID userId, Long id) {
		tx.executeWithoutResult(s -> searches.delete(own(userId, id)));
	}

	/** New listings since the search was last checked (for the list's "N new" badge). */
	public long newCount(SavedSearch x) {
		return products.search(x.getCategorySlug(), x.getQ(), null, specFilter(x), x.getMinPrice(), x.getMaxPrice(), x.getLastSeenProductId(),
				PageRequest.of(0, 1)).getTotalElements();
	}

	/** The shop page address that shows this search. */
	public static String link(SavedSearch x, Map<String, Object> specValues) {
		List<String> parts = new ArrayList<>();
		add(parts, "category", x.getCategorySlug());
		add(parts, "q", x.getQ());
		specValues.forEach((k, v) -> add(parts, "spec." + k, v instanceof List<?> l && !l.isEmpty() ? String.valueOf(l.get(0)) : String.valueOf(v)));
		add(parts, "minPrice", x.getMinPrice() == null ? null : x.getMinPrice().stripTrailingZeros().toPlainString());
		add(parts, "maxPrice", x.getMaxPrice() == null ? null : x.getMaxPrice().stripTrailingZeros().toPlainString());
		return "/shop" + (parts.isEmpty() ? "" : "?" + String.join("&", parts));
	}

	// ---------- alerts ----------

	/** Every 15 minutes: tell people about new listings matching their saved searches. Returns how many were alerted. */
	@Scheduled(fixedDelayString = "${app.saved-searches.check:PT15M}", initialDelayString = "PT4M")
	public int runAlerts() {
		int alerted = 0;
		for (SavedSearch x : searches.withAlerts()) {
			try {
				if (alert(x)) {
					alerted++;
				}
			} catch (RuntimeException e) {
				log.warn("Saved search #{} alert failed: {}", x.getId(), e.getMessage());
			}
		}
		return alerted;
	}

	private boolean alert(SavedSearch x) {
		List<Product> fresh = tx.execute(s -> products.search(x.getCategorySlug(), x.getQ(), null, specFilter(x), x.getMinPrice(),
				x.getMaxPrice(), x.getLastSeenProductId(), PageRequest.of(0, 10, Sort.by("id").descending())).getContent());
		if (fresh == null || fresh.isEmpty()) {
			return false;
		}
		long newest = fresh.stream().mapToLong(Product::getId).max().orElse(x.getLastSeenProductId());
		Product first = fresh.get(0);
		String link = link(x, specs.read(x.getSpecs()));
		String title = fresh.size() == 1 ? "New for \"" + x.getName() + "\"" : fresh.size() + (fresh.size() == 10 ? "+" : "") + " new for \"" + x.getName() + "\"";
		String body = first.getName() + " · " + first.getPrice().stripTrailingZeros().toPlainString() + " birr"
				+ (fresh.size() > 1 ? " and " + (fresh.size() - 1) + " more" : "");
		if (x.isAlertInbox()) {
			inbox.notify(x.getUserId(), InboxItem.Kind.ALERT, title, body, link, "search:" + x.getId() + ":" + newest);
		}
		Instant now = Instant.now();
		boolean smsNow = x.isAlertSms() && (x.getLastSmsAt() == null || x.getLastSmsAt().isBefore(now.minus(SMS_GAP)));
		if (smsNow) {
			String phone = users.findById(x.getUserId()).map(User::getPhone).orElse(null);
			if (phone != null && !phone.isBlank()) {
				sms.send(SmsService.Kind.OTHER, phone, "Sodo Gebeya: " + title + ": " + body + ". Open Saved searches to see them.", null, null);
			} else {
				smsNow = false;
			}
		}
		boolean sent = smsNow;
		tx.executeWithoutResult(s -> searches.findById(x.getId()).ifPresent(fresh2 -> {
			fresh2.setLastSeenProductId(newest);
			fresh2.setLastAlertAt(now);
			if (sent) {
				fresh2.setLastSmsAt(now);
			}
		}));
		return true;
	}

	// ---------- helpers ----------

	private static String specFilter(SavedSearch x) {
		return x.getSpecs() == null || x.getSpecs().isBlank() || "{}".equals(x.getSpecs().replace(" ", "")) ? null : x.getSpecs();
	}

	private SavedSearch own(UUID userId, Long id) {
		return searches.findById(id).filter(x -> x.getUserId().equals(userId)).orElseThrow(() -> ApiException.notFound("Saved search"));
	}

	private static String defaultName(String q, Category cat, Map<String, String> specValues) {
		List<String> bits = new ArrayList<>();
		if (specValues != null) {
			new LinkedHashMap<>(specValues).values().stream().filter(v -> v != null && !v.isBlank()).limit(2).forEach(bits::add);
		}
		if (q != null) {
			bits.add(q);
		}
		if (cat != null && bits.isEmpty()) {
			bits.add(cat.getName());
		}
		String n = String.join(" ", bits);
		return n.length() > 80 ? n.substring(0, 80) : n;
	}

	private static void add(List<String> parts, String k, String v) {
		if (v != null && !v.isBlank()) {
			parts.add(k + "=" + URLEncoder.encode(v, StandardCharsets.UTF_8).replace("+", "%20"));
		}
	}

	private static BigDecimal positive(BigDecimal v) {
		return v == null || v.signum() <= 0 ? null : v;
	}

	private static boolean blank(String s) {
		return s == null || s.isBlank();
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}
}
