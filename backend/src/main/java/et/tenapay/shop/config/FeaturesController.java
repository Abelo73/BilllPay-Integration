package et.tenapay.shop.config;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Feature switches for the store and staff, and revealing a seller's phone (Jiji-style buying). */
@RestController
@RequiredArgsConstructor
public class FeaturesController {

	/** A buyer may reveal at most this many numbers a day (stops scraping sellers' phones). */
	static final int MAX_REVEALS_PER_DAY = 40;

	private final Features features;
	private final ProductRepository products;
	private final JdbcTemplate jdbc;

	public record Setting(String key, String type, String value, String defaultValue, String group, String label, String help) {
	}

	public record SetRequest(@NotNull @Size(max = 200) String value) {
	}

	/** What a buyer needs to contact the seller outside the app. */
	public record Contact(String name, String phone, String whatsapp, String telegram) {
	}

	@GetMapping("/api/features")
	public Map<String, String> forStore() {
		return features.all(true);
	}

	@GetMapping("/api/admin/features")
	public List<Setting> forStaff() {
		return Features.DEFS.stream().map(d -> new Setting(d.key(), d.type().name(), features.value(d.key()), d.defaultValue(),
				d.group(), d.label(), d.help())).toList();
	}

	@PutMapping("/api/admin/features/{key}")
	public List<Setting> set(@PathVariable String key, @Valid @RequestBody SetRequest req) {
		features.set(key, req.value(), CurrentUser.get().map(CurrentUser::email).orElse("staff"));
		return forStaff();
	}

	/** Signed-in buyers reveal the seller's phone; each reveal is counted for the seller (and limited per day). */
	@GetMapping("/api/products/{id}/contact")
	@Transactional
	public Contact contact(@PathVariable Long id) {
		features.require(Features.SHOW_SELLER_PHONE);
		UUID me = CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
				"Sign in to see the seller's phone number."));
		Product p = products.findWithCategoryById(id).filter(Product::sellable).orElseThrow(() -> ApiException.notFound("Product"));
		Integer today = jdbc.queryForObject("select count(*) from contact_reveals where user_id = ? and created_at > ?",
				Integer.class, me, Timestamp.from(Instant.now().minusSeconds(86400)));
		if (today != null && today >= MAX_REVEALS_PER_DAY) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_CONTACTS",
					"You've looked up many numbers today. Use chat, or try again tomorrow.");
		}
		String name;
		String phone;
		if (p.getShop() == null) {
			name = "Sodo Gebeya";
			phone = features.text(Features.SUPPORT_PHONE);
		} else {
			name = p.getShop().getName();
			phone = p.getShop().getPhone();
		}
		if (phone == null || phone.isBlank()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NO_PHONE", "This seller can only be reached by chat.");
		}
		jdbc.update("insert into contact_reveals (product_id, shop_id, user_id) values (?, ?, ?)", p.getId(),
				p.getShop() == null ? null : p.getShop().getId(), me);
		String digits = phone.replaceAll("[^0-9]", "");
		return new Contact(name, phone, "https://wa.me/" + digits, null);
	}
}
