package et.tenapay.shop.seller;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.catalog.Slugs;
import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.PhoneAuthService;
import et.tenapay.shop.user.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Seller shops: a customer opens one, staff approve it, then its products show in the store. Every seller request
 * goes through {@link #requireMine()}, so a seller can only ever reach their own shop.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopService {

	private final ShopRepository shops;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final AppProperties app;
	private final TransactionTemplate tx;

	public record ShopForm(ShopKind kind, String name, String description, String phone, String area,
			String addressLine) {
	}

	public enum ImageKind { LOGO, COVER }

	/** The signed-in customer's shop, or 404 NO_SHOP. Staff have no shop. */
	public Shop requireMine() {
		CurrentUser me = CurrentUser.require();
		if (me.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "NOT_A_SELLER", "Staff accounts can't sell. Use a customer account.");
		}
		return shops.findByOwnerId(me.id())
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_SHOP", "You haven't opened a shop yet."));
	}

	public Shop open(UUID ownerId, ShopForm f) {
		return tx.execute(s -> {
			if (shops.findByOwnerId(ownerId).isPresent()) {
				throw new ApiException(HttpStatus.CONFLICT, "SHOP_EXISTS", "This account already has a shop.");
			}
			Shop shop = new Shop();
			shop.setOwnerId(ownerId);
			shop.setKind(f.kind() == null ? ShopKind.SHOP : f.kind());
			shop.setName(f.name().trim());
			shop.setSlug(Slugs.unique(Slugs.slugify(f.name()), "shop", shops::existsBySlug));
			shop.setDescription(blankToNull(f.description()));
			shop.setPhone(PhoneAuthService.mobile(f.phone()));
			shop.setArea(blankToNull(f.area()));
			shop.setAddressLine(blankToNull(f.addressLine()));
			shop.setStatus(ShopStatus.PENDING);
			shops.save(shop);
			metrics.shopEvent("opened");
			log.info("Shop #{} \"{}\" opened by {}, waiting for approval", shop.getId(), shop.getName(), ownerId);
			return shop;
		});
	}

	/** Edits the details. A rejected shop that is edited goes back to the approval queue. */
	public Shop update(Long shopId, ShopForm f) {
		return tx.execute(s -> {
			Shop shop = shops.findById(shopId).orElseThrow(() -> ApiException.notFound("Shop"));
			if (f.name() != null && !f.name().isBlank()) {
				shop.setName(f.name().trim()); // the address (slug) stays, so shared links keep working
			}
			if (f.kind() != null) {
				shop.setKind(f.kind());
			}
			shop.setDescription(blankToNull(f.description()));
			if (f.phone() != null && !f.phone().isBlank()) {
				shop.setPhone(PhoneAuthService.mobile(f.phone()));
			}
			shop.setArea(blankToNull(f.area()));
			shop.setAddressLine(blankToNull(f.addressLine()));
			if (shop.getStatus() == ShopStatus.REJECTED) {
				shop.setStatus(ShopStatus.PENDING);
				metrics.shopEvent("resubmitted");
				log.info("Shop #{} edited after rejection, back in the approval queue", shop.getId());
			}
			return shop;
		});
	}

	/** Logo (square, the 400 px version) or cover photo (the 1200 px version). Replaces the old one. */
	public Shop setImage(Long shopId, ImageKind kind, byte[] upload) {
		ImageProcessor.Processed img = images.process(upload);
		String key = "shops/" + shopId + "/" + UUID.randomUUID() + "-" + kind.name().toLowerCase() + ".jpg";
		storage.put(key, kind == ImageKind.LOGO ? img.thumb() : img.large(), "image/jpeg");
		String[] old = new String[1];
		Shop shop = tx.execute(s -> {
			Shop sh = shops.findById(shopId).orElseThrow(() -> ApiException.notFound("Shop"));
			old[0] = kind == ImageKind.LOGO ? sh.getLogoKey() : sh.getCoverKey();
			if (kind == ImageKind.LOGO) {
				sh.setLogoKey(key);
			} else {
				sh.setCoverKey(key);
			}
			return sh;
		});
		if (old[0] != null) {
			storage.delete(old[0]);
		}
		return shop;
	}

	/**
	 * Staff decision. Approve (from pending, rejected or suspended), reject (pending only) or suspend (approved only).
	 * Rejecting and suspending need a reason, which the seller sees. The seller gets an SMS.
	 */
	public Shop decide(Long shopId, ShopStatus to, String note, String by) {
		String reason = blankToNull(note);
		Shop shop = tx.execute(s -> {
			Shop sh = shops.findById(shopId).orElseThrow(() -> ApiException.notFound("Shop"));
			ShopStatus from = sh.getStatus();
			boolean allowed = switch (to) {
				case APPROVED -> from != ShopStatus.APPROVED;
				case REJECTED -> from == ShopStatus.PENDING;
				case SUSPENDED -> from == ShopStatus.APPROVED;
				case PENDING -> false;
			};
			if (!allowed) {
				throw new ApiException(HttpStatus.CONFLICT, "INVALID_SHOP_STEP",
						"Can't go from " + label(from) + " to " + label(to) + ".", Map.of("from", from.name()));
			}
			if (to != ShopStatus.APPROVED && reason == null) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED",
						"Tell the seller why, so they can fix it.");
			}
			sh.setStatus(to);
			sh.setStatusNote(to == ShopStatus.APPROVED ? null : reason);
			sh.setDecidedAt(Instant.now());
			sh.setDecidedBy(by);
			metrics.shopEvent(to.name().toLowerCase());
			log.info("Shop #{} {} -> {} by {}{}", sh.getId(), from, to, by, reason == null ? "" : ": " + reason);
			return sh;
		});
		String text = switch (to) {
			case APPROVED -> "Sodo Gebeya: your shop \"" + shop.getName() + "\" is approved. Your products now show in the store: "
					+ app.publicBaseUrl() + "/shops/" + shop.getSlug();
			case REJECTED -> "Sodo Gebeya: your shop \"" + shop.getName() + "\" was not approved: " + reason
					+ ". Fix it in Sell > Shop details and it comes back to us.";
			case SUSPENDED -> "Sodo Gebeya: your shop \"" + shop.getName() + "\" is paused and hidden from the store: " + reason
					+ ". Call us to sort it out.";
			case PENDING -> null;
		};
		if (text != null && shop.getPhone() != null) {
			AfterCommit.run(() -> sms.send(SmsService.Kind.SHOP, shop.getPhone(), text, null, null));
		}
		return shop;
	}

	private static String label(ShopStatus s) {
		return s.name().toLowerCase();
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}
}
