package et.tenapay.shop.admin;

import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ListingReport;
import et.tenapay.shop.catalog.ListingReportRepository;
import et.tenapay.shop.catalog.ListingReportService;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Reported listings (design S21): most reported first; hide (seller told why), dismiss, or put back. */
@RestController
@RequestMapping("/api/admin/listing-reports")
@RequiredArgsConstructor
public class ListingReportAdminController {

	private final ListingReportRepository reports;
	private final ListingReportService service;
	private final ProductRepository products;

	public record ReportLine(String reason, String details, Instant createdAt) {
	}

	public record Row(Long productId, String productName, String slug, String imageUrl, String shopName, Long shopId,
			boolean shopVerified, boolean active, String blockedReason, long reports, Instant lastReportedAt,
			Map<String, Long> reasons, List<ReportLine> latest) {
	}

	public record ListView(long open, PageDto<Row> page) {
	}

	public record NoteRequest(@Size(max = 500) String note) {
	}

	/** status: OPEN (to decide), HIDDEN (taken down), DISMISSED. */
	@GetMapping
	@Transactional(readOnly = true)
	public ListView list(@RequestParam(defaultValue = "OPEN") ListingReport.Status status,
			@RequestParam(defaultValue = "0") int page) {
		Set<ListingReport.Status> statuses = EnumSet.of(status);
		return new ListView(reports.countByStatus(ListingReport.Status.OPEN), PageDto.of(
				reports.groupedByProduct(statuses, PageRequest.of(page, 20)).map(r -> row((Long) r[0], status,
						((Number) r[1]).longValue(), (Instant) r[2]))));
	}

	@PostMapping("/{productId}/hide")
	public Map<String, Object> hide(@PathVariable Long productId, @Valid @RequestBody NoteRequest req) {
		service.hide(productId, req.note(), by());
		return Map.of("productId", productId, "hidden", true);
	}

	@PostMapping("/{productId}/dismiss")
	public Map<String, Object> dismiss(@PathVariable Long productId) {
		return Map.of("productId", productId, "dismissed", service.dismiss(productId, by()));
	}

	@PostMapping("/{productId}/unblock")
	public Map<String, Object> unblock(@PathVariable Long productId) {
		service.unblock(productId);
		return Map.of("productId", productId, "blocked", false);
	}

	private Row row(Long productId, ListingReport.Status status, long count, Instant last) {
		Product p = products.findWithCategoryById(productId).orElseThrow();
		List<ListingReport> list = reports.findByProductIdAndStatus(productId, status);
		Map<String, Long> reasons = new LinkedHashMap<>();
		list.forEach(r -> reasons.merge(r.getReason().name(), 1L, Long::sum));
		List<ReportLine> latest = list.stream().sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt())).limit(5)
				.map(r -> new ReportLine(r.getReason().name(), r.getDetails(), r.getCreatedAt())).toList();
		var shop = p.getShop();
		return new Row(p.getId(), p.getName(), p.getSlug(), p.getImageUrl(), shop == null ? null : shop.getName(),
				shop == null ? null : shop.getId(), shop != null && shop.getVerifiedAt() != null, p.isActive(),
				p.getBlockedReason(), count, last, reasons, latest);
	}

	private static String by() {
		return CurrentUser.get().map(CurrentUser::email).orElse("staff");
	}
}
