package et.tenapay.shop.catalog;

import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Shoppers report listings; staff hide the listing (the seller is told why) or dismiss the reports. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ListingReportService {

	private final ListingReportRepository reports;
	private final ProductRepository products;
	private final CatalogAdminService catalog;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	public ListingReport report(Long productId, UUID reporterId, ListingReport.Reason reason, String details) {
		Product p = products.findWithCategoryById(productId).filter(Product::sellable)
				.orElseThrow(() -> ApiException.notFound("Product"));
		if (p.getShop() != null && p.getShop().getOwnerId().equals(reporterId)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "OWN_LISTING", "You can't report your own listing.");
		}
		if (reports.existsByProductIdAndReporterId(productId, reporterId)) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REPORTED", "You already reported this. Our team will look at it.");
		}
		ListingReport r = new ListingReport();
		r.setProductId(productId);
		r.setReporterId(reporterId);
		r.setReason(reason);
		r.setDetails(details == null || details.isBlank() ? null : details.trim());
		try {
			reports.saveAndFlush(r);
		} catch (DataIntegrityViolationException twice) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REPORTED", "You already reported this. Our team will look at it.");
		}
		metrics.shopEvent("listing_reported");
		log.info("Listing #{} reported ({})", productId, reason);
		return r;
	}

	/** Hides the listing and closes its open reports; the seller gets an SMS with the reason. */
	public void hide(Long productId, String note, String by) {
		String reason = note == null || note.isBlank() ? null : note.trim();
		if (reason == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Tell the seller why it was hidden.");
		}
		catalog.block(productId, reason);
		Product p = tx.execute(s -> {
			reports.closeOpen(productId, ListingReport.Status.HIDDEN, by);
			return products.findWithCategoryById(productId).orElseThrow();
		});
		metrics.shopEvent("listing_hidden");
		Shop shop = p.getShop();
		if (shop != null && shop.getPhone() != null) {
			String text = "Sodo Gebeya: your listing \"" + p.getName() + "\" was taken off the store: " + reason
					+ ". Edit it and call us to put it back.";
			String phone = shop.getPhone();
			AfterCommit.run(() -> sms.send(SmsService.Kind.SHOP, phone, text, null, null));
		}
	}

	/** Lifts a staff block; the listing shows again (if the seller has it switched on). */
	public void unblock(Long productId) {
		catalog.unblock(productId);
	}

	/** Closes the open reports and leaves the listing as it is. */
	public int dismiss(Long productId, String by) {
		Integer n = tx.execute(s -> reports.closeOpen(productId, ListingReport.Status.DISMISSED, by));
		return n == null ? 0 : n;
	}
}
