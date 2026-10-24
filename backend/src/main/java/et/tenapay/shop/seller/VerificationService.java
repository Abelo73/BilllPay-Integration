package et.tenapay.shop.seller;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.seller.Verification.Photo;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * The Verified badge: a seller sends ID photos, staff check them. Photos are re-encoded (which drops camera metadata
 * such as GPS) and stored under {@code private/}, a key the public media route never serves. Only staff and the
 * seller can open them, through their own authenticated endpoints.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VerificationService {

	public static final String PRIVATE_PREFIX = "private/";

	private final VerificationRepository verifications;
	private final ShopRepository shops;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	public Verification latest(Long shopId) {
		return verifications.findFirstByShopIdOrderByIdDesc(shopId).orElse(null);
	}

	/** The request the seller can still change: the open draft (or one sent back), or a new one. */
	private Verification editable(Shop shop) {
		Verification v = latest(shop.getId());
		if (v != null && v.getStatus().editable()) {
			return v;
		}
		if (v != null && v.getStatus() == VerificationStatus.SUBMITTED) {
			throw new ApiException(HttpStatus.CONFLICT, "VERIFICATION_WAITING",
					"Your documents are with our team. You can change them if we ask.");
		}
		if (shop.getVerifiedAt() != null) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_VERIFIED", "Your shop is already verified.");
		}
		Verification fresh = new Verification();
		fresh.setShopId(shop.getId());
		return verifications.save(fresh); // a rejected request stays as it was; this is a new try
	}

	public Verification upload(Shop shop, Photo photo, byte[] upload) {
		ImageProcessor.Processed img = images.process(upload);
		String key = PRIVATE_PREFIX + "verification/" + shop.getId() + "/" + UUID.randomUUID() + "-"
				+ photo.name().toLowerCase().replace('_', '-') + ".jpg";
		storage.put(key, img.large(), "image/jpeg");
		String[] old = new String[1];
		Verification v;
		try {
			v = tx.execute(s -> {
				Verification ver = editable(shop);
				old[0] = ver.key(photo);
				ver.setKey(photo, key);
				return verifications.save(ver);
			});
		} catch (RuntimeException e) {
			storage.delete(key);
			throw e;
		}
		if (old[0] != null) {
			storage.delete(old[0]);
		}
		return v;
	}

	public Verification details(Shop shop, Verification.IdType idType, String details) {
		return tx.execute(s -> {
			Verification v = editable(shop);
			if (idType != null) {
				v.setIdType(idType);
			}
			v.setDetails(details == null || details.isBlank() ? null : details.trim());
			return verifications.save(v);
		});
	}

	/** Sends it to staff. ID front and the selfie are required; a two-sided ID also needs its back. */
	public Verification submit(Shop shop) {
		return tx.execute(s -> {
			Verification v = latest(shop.getId());
			if (v == null || !v.getStatus().editable()) {
				throw new ApiException(HttpStatus.CONFLICT, "NOTHING_TO_SEND", "Add your photos first.");
			}
			if (v.getIdFrontKey() == null || v.getSelfieKey() == null
					|| (v.getIdType() != Verification.IdType.PASSPORT && v.getIdBackKey() == null)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "PHOTOS_MISSING",
						"Add both sides of your ID and a selfie holding it.",
						Map.of("front", v.getIdFrontKey() != null, "back", v.getIdBackKey() != null,
								"selfie", v.getSelfieKey() != null));
			}
			v.setStatus(VerificationStatus.SUBMITTED);
			v.setSubmittedAt(Instant.now());
			metrics.shopEvent("verification_submitted");
			log.info("Verification #{} of shop #{} sent to staff", v.getId(), shop.getId());
			return v;
		});
	}

	/** Staff decision on a sent request: approve (Verified badge), ask for better photos, or reject. */
	public Verification decide(Long id, VerificationStatus to, String note, String by) {
		String reason = note == null || note.isBlank() ? null : note.trim();
		if (to != VerificationStatus.APPROVED && to != VerificationStatus.MORE_INFO && to != VerificationStatus.REJECTED) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DECISION", "Approve, ask for more, or reject.");
		}
		if (to != VerificationStatus.APPROVED && reason == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Tell the seller what to fix.");
		}
		Shop[] shop = new Shop[1];
		Verification v = tx.execute(s -> {
			Verification ver = verifications.findById(id).orElseThrow(() -> ApiException.notFound("Verification"));
			if (ver.getStatus() != VerificationStatus.SUBMITTED) {
				throw new ApiException(HttpStatus.CONFLICT, "NOT_WAITING", "This request was already decided.");
			}
			ver.setStatus(to);
			ver.setStaffNote(reason);
			ver.setDecidedAt(Instant.now());
			ver.setDecidedBy(by);
			Shop sh = shops.findById(ver.getShopId()).orElseThrow();
			if (to == VerificationStatus.APPROVED) {
				sh.setVerifiedAt(Instant.now());
			}
			shop[0] = sh;
			metrics.shopEvent("verification_" + to.name().toLowerCase());
			log.info("Verification #{} of shop #{} -> {} by {}", id, sh.getId(), to, by);
			return ver;
		});
		String text = switch (to) {
			case APPROVED -> "Sodo Gebeya: \"" + shop[0].getName() + "\" is now Verified. Buyers see the badge on your shop and products.";
			case MORE_INFO -> "Sodo Gebeya: we need one more thing to verify \"" + shop[0].getName() + "\": " + reason
					+ ". Open Sell > Get verified.";
			default -> "Sodo Gebeya: we couldn't verify \"" + shop[0].getName() + "\": " + reason + ".";
		};
		if (shop[0].getPhone() != null) {
			String phone = shop[0].getPhone();
			AfterCommit.run(() -> sms.send(SmsService.Kind.SHOP, phone, text, null, null));
		}
		return v;
	}

	/** The photo bytes, for the seller's own view or for staff. */
	public byte[] photo(Verification v, Photo photo) {
		String key = v.key(photo);
		if (key == null || !key.startsWith(PRIVATE_PREFIX)) {
			throw ApiException.notFound("Photo");
		}
		MediaStorage.StoredObject obj = storage.get(key).orElseThrow(() -> ApiException.notFound("Photo"));
		try (InputStream in = obj.content()) {
			return in.readAllBytes();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
