package et.tenapay.shop.search;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.catalog.SpecsService;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** M9: my saved searches (Account → Saved searches, and "Save this search" on the shop page). */
@RestController
@RequiredArgsConstructor
public class SavedSearchController {

	private final SavedSearchService service;
	private final SavedSearchRepository searches;
	private final ProductRepository products;
	private final SpecsService specs;

	public record SearchRequest(@Size(max = 80) String name, @Size(max = 120) String q, @Size(max = 120) String category,
			@Size(max = 20) Map<String, String> specs, @DecimalMax("100000000") BigDecimal minPrice, @DecimalMax("100000000") BigDecimal maxPrice,
			Boolean alertInbox, Boolean alertSms) {
	}

	public record UpdateRequest(@Size(max = 80) String name, Boolean alertInbox, Boolean alertSms) {
	}

	/** {@code link}: the shop page that shows it; {@code newCount}: listings since it was last opened. */
	public record SearchView(Long id, String name, String q, String category, Map<String, Object> specs, BigDecimal minPrice,
			BigDecimal maxPrice, boolean alertInbox, boolean alertSms, long newCount, String link, Instant lastAlertAt, Instant createdAt) {
	}

	@GetMapping("/api/me/searches")
	@Transactional(readOnly = true)
	public List<SearchView> mine() {
		UUID me = CurrentUser.require().id();
		return searches.findByUserIdOrderByIdDesc(me).stream().map(this::view).toList();
	}

	@PostMapping("/api/me/searches")
	public SearchView create(@Valid @RequestBody SearchRequest r) {
		SavedSearch x = service.create(CurrentUser.require().id(),
				new SavedSearchService.Form(r.name(), r.q(), r.category(), r.specs(), r.minPrice(), r.maxPrice(), r.alertInbox(), r.alertSms()));
		return view(x);
	}

	@PatchMapping("/api/me/searches/{id}")
	public SearchView update(@PathVariable Long id, @Valid @RequestBody UpdateRequest r) {
		return view(service.update(CurrentUser.require().id(), id, r.name(), r.alertInbox(), r.alertSms()));
	}

	/** Opening a saved search marks its listings as seen. */
	@PostMapping("/api/me/searches/{id}/seen")
	@Transactional
	public SearchView seen(@PathVariable Long id) {
		UUID me = CurrentUser.require().id();
		SavedSearch x = searches.findById(id).filter(s -> s.getUserId().equals(me)).orElseThrow(() -> ApiException.notFound("Saved search"));
		x.setLastSeenProductId(products.maxId());
		return view(x);
	}

	@DeleteMapping("/api/me/searches/{id}")
	public Map<String, Object> delete(@PathVariable Long id) {
		service.delete(CurrentUser.require().id(), id);
		return Map.of("deleted", true);
	}

	/** Staff: send the alerts now instead of waiting for the 15-minute check. */
	@PostMapping("/api/admin/saved-searches/run-alerts")
	public Map<String, Object> runAlerts() {
		return Map.of("alerted", service.runAlerts());
	}

	private SearchView view(SavedSearch x) {
		Map<String, Object> values = specs.read(x.getSpecs());
		return new SearchView(x.getId(), x.getName(), x.getQ(), x.getCategorySlug(), values, x.getMinPrice(), x.getMaxPrice(), x.isAlertInbox(),
				x.isAlertSms(), service.newCount(x), SavedSearchService.link(x, values), x.getLastAlertAt(), x.getCreatedAt());
	}
}
