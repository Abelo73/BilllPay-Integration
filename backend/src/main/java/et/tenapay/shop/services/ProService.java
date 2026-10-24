package et.tenapay.shop.services;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.order.CheckoutService;
import et.tenapay.shop.sms.SmsService;
import lombok.extern.slf4j.Slf4j;

/** Pro profiles (design S7/S8): create and edit your own, staff approve, everyone browses approved ones. */
@Slf4j
@Service
public class ProService {

	public static final int MAX_PHOTOS = 6;
	public static final int MAX_PRICES = 12;

	private final ProProfileRepository pros;
	private final ProPriceRepository prices;
	private final ProPhotoRepository photos;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final MediaProperties media;
	private final SmsService sms;
	private final TransactionTemplate tx;

	public ProService(ProProfileRepository pros, ProPriceRepository prices, ProPhotoRepository photos, ImageProcessor images,
			MediaStorage storage, MediaProperties media, SmsService sms, TransactionTemplate tx) {
		this.pros = pros;
		this.prices = prices;
		this.photos = photos;
		this.images = images;
		this.storage = storage;
		this.media = media;
		this.sms = sms;
		this.tx = tx;
	}

	// ---------- views ----------

	public record PriceLine(String label, BigDecimal priceFrom) {
	}

	public record Photo(Long id, String url) {
	}

	public record ProCard(Long id, String displayName, String trade, String headline, String areas, Integer yearsExperience,
			BigDecimal rating, int ratingCount, int jobsDone, BigDecimal priceFrom) {
	}

	/** Public profile; {@code phone}, {@code status} and {@code statusNote} are filled only for the owner and staff. */
	public record ProDetail(ProCard card, String bio, List<PriceLine> prices, List<Photo> photos, String phone, String status,
			String statusNote, Instant createdAt) {
	}

	public record ProInput(String displayName, ProProfile.Trade trade, String headline, String bio, Integer yearsExperience,
			String areas, String phone, List<PriceLine> prices) {
	}

	// ---------- the pro's own profile ----------

	public ProDetail mine(UUID ownerId) {
		return tx.execute(s -> pros.findByOwnerId(ownerId).map(p -> detail(p, true)).orElse(null));
	}

	/** Creates or updates the caller's profile. A rejected profile goes back to staff after an edit. */
	public ProDetail save(UUID ownerId, ProInput in) {
		String name = trim(in.displayName(), 120);
		if (name == null || in.trade() == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_FIELDS", "Add your name and your trade.");
		}
		String phone = in.phone() == null ? null : CheckoutService.normalizePhone(in.phone());
		if (phone == null || !phone.matches("^\\+251[79]\\d{8}$")) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PHONE", "Add an Ethiopian mobile number customers can call.");
		}
		List<PriceLine> lines = in.prices() == null ? List.of() : in.prices().stream()
				.filter(l -> l != null && l.label() != null && !l.label().isBlank()).limit(MAX_PRICES).toList();
		for (PriceLine l : lines) {
			if (l.priceFrom() != null && l.priceFrom().signum() <= 0) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_PRICE", "Prices must be more than 0, or left empty for \"ask for a quote\".");
			}
		}
		return tx.execute(s -> {
			ProProfile p = pros.findByOwnerId(ownerId).orElseGet(() -> {
				ProProfile n = new ProProfile();
				n.setOwnerId(ownerId);
				return n;
			});
			p.setDisplayName(name);
			p.setTrade(in.trade());
			p.setHeadline(trim(in.headline(), 160));
			p.setBio(trim(in.bio(), 2000));
			p.setYearsExperience(in.yearsExperience() == null ? null : Math.max(0, Math.min(60, in.yearsExperience())));
			p.setAreas(trim(in.areas(), 300));
			p.setPhone(phone);
			if (p.getStatus() == ProProfile.Status.REJECTED) {
				p.setStatus(ProProfile.Status.PENDING);
				p.setStatusNote(null);
			}
			pros.saveAndFlush(p);
			prices.deleteByProId(p.getId());
			int i = 0;
			for (PriceLine l : lines) {
				ProPrice row = new ProPrice();
				row.setProId(p.getId());
				row.setLabel(trim(l.label(), 120));
				row.setPriceFrom(l.priceFrom());
				row.setPosition(i++);
				prices.save(row);
			}
			return detail(p, true);
		});
	}

	public Photo addPhoto(UUID ownerId, byte[] upload) {
		ProProfile p = pros.findByOwnerId(ownerId).orElseThrow(() -> ApiException.notFound("Profile"));
		if (photos.countByProId(p.getId()) >= MAX_PHOTOS) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_PHOTOS", "Up to " + MAX_PHOTOS + " photos. Remove one first.");
		}
		ImageProcessor.Processed img = images.process(upload);
		String key = "pros/" + p.getId() + "/" + UUID.randomUUID() + "-l.jpg";
		storage.put(key, img.large(), "image/jpeg");
		return tx.execute(s -> {
			ProPhoto ph = new ProPhoto();
			ph.setProId(p.getId());
			ph.setImageKey(key);
			ph.setPosition((int) photos.countByProId(p.getId()));
			photos.save(ph);
			return new Photo(ph.getId(), media.urlFor(key));
		});
	}

	public void deletePhoto(UUID ownerId, Long photoId) {
		tx.executeWithoutResult(s -> {
			ProProfile p = pros.findByOwnerId(ownerId).orElseThrow(() -> ApiException.notFound("Profile"));
			ProPhoto ph = photos.findById(photoId).filter(x -> x.getProId().equals(p.getId()))
					.orElseThrow(() -> ApiException.notFound("Photo"));
			photos.delete(ph);
			try {
				storage.delete(ph.getImageKey());
			} catch (RuntimeException e) {
				log.warn("Could not delete {}: {}", ph.getImageKey(), e.getMessage());
			}
		});
	}

	// ---------- browsing ----------

	public PageDto<ProCard> search(ProProfile.Trade trade, String q, int page) {
		return tx.execute(s -> PageDto.of(pros.search(trade, q == null || q.isBlank() ? null : q.trim(), PageRequest.of(page, 20))
				.map(this::card)));
	}

	/** Approved profiles for everyone; the owner (and staff) also see pending ones. */
	public ProDetail get(Long id, UUID viewer, boolean staff) {
		return tx.execute(s -> {
			ProProfile p = pros.findById(id).orElseThrow(() -> ApiException.notFound("Pro"));
			boolean owner = viewer != null && viewer.equals(p.getOwnerId());
			if (!p.getStatus().listed() && !owner && !staff) {
				throw ApiException.notFound("Pro");
			}
			return detail(p, owner || staff);
		});
	}

	// ---------- staff ----------

	public PageDto<ProDetail> adminList(ProProfile.Status status, int page) {
		return tx.execute(s -> PageDto.of(pros.adminList(status, PageRequest.of(page, 30)).map(p -> detail(p, true))));
	}

	public ProDetail decide(Long id, ProProfile.Status status, String note, String staff) {
		if (status == null || status == ProProfile.Status.PENDING) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_STATUS", "Choose approve, reject or suspend.");
		}
		ProDetail d = tx.execute(s -> {
			ProProfile p = pros.findById(id).orElseThrow(() -> ApiException.notFound("Pro"));
			p.setStatus(status);
			p.setStatusNote(trim(note, 500));
			p.setDecidedAt(Instant.now());
			p.setDecidedBy(staff);
			return detail(p, true);
		});
		String text = switch (status) {
			case APPROVED -> "Sodo Gebeya: your pro profile is approved. Customers can now find you and send you jobs.";
			case REJECTED -> "Sodo Gebeya: your pro profile needs changes before it can be shown. Open the app to see why.";
			default -> "Sodo Gebeya: your pro profile was paused by our team. Open the app to see why.";
		};
		sms.sendOnce(SmsService.Kind.JOB, d.phone(), text, null, "PRO:" + id + ":" + status + ":" + Instant.now().getEpochSecond() / 60);
		return d;
	}

	// ---------- helpers ----------

	ProProfile approved(Long id) {
		return pros.findById(id).filter(p -> p.getStatus().listed()).orElseThrow(() -> ApiException.notFound("Pro"));
	}

	ProCard card(ProProfile p) {
		BigDecimal from = prices.findByProIdOrderByPositionAsc(p.getId()).stream().map(ProPrice::getPriceFrom)
				.filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null);
		return new ProCard(p.getId(), p.getDisplayName(), p.getTrade().name(), p.getHeadline(), p.getAreas(),
				p.getYearsExperience(), p.rating(), p.getRatingCount(), p.getJobsDone(), from);
	}

	private ProDetail detail(ProProfile p, boolean privateFields) {
		List<PriceLine> list = prices.findByProIdOrderByPositionAsc(p.getId()).stream()
				.map(x -> new PriceLine(x.getLabel(), x.getPriceFrom())).toList();
		List<Photo> pics = photos.findByProIdOrderByPositionAsc(p.getId()).stream()
				.map(x -> new Photo(x.getId(), media.urlFor(x.getImageKey()))).toList();
		return new ProDetail(card(p), p.getBio(), list, pics, privateFields ? p.getPhone() : null,
				privateFields ? p.getStatus().name() : null, privateFields ? p.getStatusNote() : null, p.getCreatedAt());
	}

	static String trim(String s, int max) {
		if (s == null || s.isBlank()) {
			return null;
		}
		String t = s.strip();
		return t.length() > max ? t.substring(0, max) : t;
	}
}
