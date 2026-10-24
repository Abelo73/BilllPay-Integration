package et.tenapay.shop.catalog;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Shopper side: report a listing, and the areas of Sodo for forms and filters. */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ListingReportController {

	private final ListingReportService reports;
	private final AreaRepository areas;

	public record ReportRequest(@NotNull ListingReport.Reason reason, @Size(max = 1000) String details) {
	}

	/** Needs a signed-in customer, so one person can't flood a listing with reports. */
	@PostMapping("/products/{id}/report")
	public Map<String, Object> report(@PathVariable Long id, @Valid @RequestBody ReportRequest req) {
		var me = CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
				"Sign in to report a listing."));
		reports.report(id, me, req.reason(), req.details());
		return Map.of("reported", true);
	}

	@GetMapping("/areas")
	@Transactional(readOnly = true)
	public List<String> areas() {
		return areas.findByActiveTrueOrderBySortOrderAscIdAsc().stream().map(Area::getName).toList();
	}
}
