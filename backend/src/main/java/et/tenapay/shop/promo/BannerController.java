package et.tenapay.shop.promo;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** M17 banners: the home page shows the live ones; Admin → Banners adds, edits, orders and removes them. */
@RestController
@RequiredArgsConstructor
public class BannerController {

	private final BannerAdRepository banners;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final MediaProperties media;
	private final Features features;

	public record BannerView(Long id, String title, String subtitle, String imageUrl, String linkUrl, Instant startsAt, Instant endsAt,
			boolean active, boolean showing, int position, int clicks,
			String heroUrl, String phoneUrl, String stripUrl, boolean showInHero, boolean showInStrip) {
	}

	/** {@code linkUrl}: a page of this site ("/shop?category=…") or an https address. */
	public record BannerRequest(@NotBlank @Size(max = 120) String title, @Size(max = 200) String subtitle,
			@Size(max = 500) @Pattern(regexp = "^(/[^/].*|/|https://.+)?$", message = "Use a page like /shop or an https:// address") String linkUrl,
			Instant startsAt, Instant endsAt, Boolean active, Integer position, Boolean showInHero, Boolean showInStrip) {
	}

	// ---------- shoppers ----------

	@GetMapping("/api/banners")
	@Transactional(readOnly = true)
	public List<BannerView> live() {
		if (!features.on(Features.BANNERS)) {
			return List.of();
		}
		Instant now = Instant.now();
		return banners.findAllByOrderByPositionAscIdDesc().stream().filter(b -> b.showing(now)).limit(6).map(this::view).toList();
	}

	/** Counts a click and returns where to go. */
	@PostMapping("/api/banners/{id}/click")
	@Transactional
	public Map<String, String> click(@PathVariable Long id) {
		BannerAd b = banners.findById(id).filter(x -> x.showing(Instant.now())).orElseThrow(() -> ApiException.notFound("Banner"));
		b.setClicks(b.getClicks() + 1);
		return Map.of("linkUrl", b.getLinkUrl() == null ? "/" : b.getLinkUrl());
	}

	// ---------- staff ----------

	@GetMapping("/api/admin/banners")
	@Transactional(readOnly = true)
	public List<BannerView> all() {
		return banners.findAllByOrderByPositionAscIdDesc().stream().map(this::view).toList();
	}

	@PostMapping("/api/admin/banners")
	@Transactional
	public BannerView create(@Valid @RequestBody BannerRequest r) {
		BannerAd b = new BannerAd();
		apply(b, r);
		return view(banners.save(b));
	}

	@PutMapping("/api/admin/banners/{id}")
	@Transactional
	public BannerView update(@PathVariable Long id, @Valid @RequestBody BannerRequest r) {
		BannerAd b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Banner"));
		apply(b, r);
		return view(b);
	}

	@PostMapping(path = "/api/admin/banners/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Transactional
	public BannerView image(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a picture.");
		}
		BannerAd b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Banner"));
		ImageProcessor.Processed img = images.process(file.getBytes());
		String key = bannerKey(b.getId(), null);
		storage.put(key, img.large(), "image/jpeg");
		String old = b.getImageKey();
		b.setImageKey(key);
		if (old != null) {
			storage.delete(old);
		}
		return view(b);
	}

	/** One picture for one place: slot is hero (desktop 4:3), phone (16:10) or strip (3:1). */
	@PostMapping(path = "/api/admin/banners/{id}/image/{slot}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Transactional
	public BannerView slotImage(@PathVariable Long id, @PathVariable String slot, @RequestPart("file") MultipartFile file) throws IOException {
		if (!SLOTS.contains(slot)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "SLOT_UNKNOWN", "Choose the hero, phone or strip picture.");
		}
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a picture.");
		}
		BannerAd b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Banner"));
		ImageProcessor.Processed img = images.process(file.getBytes());
		String key = bannerKey(b.getId(), slot);
		storage.put(key, img.large(), "image/jpeg");
		String old = slotKey(b, slot);
		setSlotKey(b, slot, key);
		if (old != null) {
			storage.delete(old);
		}
		return view(b);
	}

	/**
	 * banners/<id>/<name>.jpg: the public media route serves only keys shaped like this (see MediaController.SAFE_KEY).
	 */
	static String bannerKey(Long id, String slot) {
		String name = (slot == null ? "" : slot + "-") + UUID.randomUUID().toString().toLowerCase();
		return "banners/" + id + "/" + name + ".jpg";
	}

	private static final java.util.Set<String> SLOTS = java.util.Set.of("hero", "phone", "strip");

	private static String slotKey(BannerAd b, String slot) {
		return switch (slot) {
			case "hero" -> b.getHeroKey();
			case "phone" -> b.getPhoneKey();
			default -> b.getStripKey();
		};
	}

	private static void setSlotKey(BannerAd b, String slot, String key) {
		switch (slot) {
			case "hero" -> b.setHeroKey(key);
			case "phone" -> b.setPhoneKey(key);
			default -> b.setStripKey(key);
		}
	}

	@DeleteMapping("/api/admin/banners/{id}")
	@Transactional
	public Map<String, Object> delete(@PathVariable Long id) {
		BannerAd b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Banner"));
		banners.delete(b);
		for (String key : java.util.List.of(java.util.Optional.ofNullable(b.getImageKey()).orElse(""),
				java.util.Optional.ofNullable(b.getHeroKey()).orElse(""), java.util.Optional.ofNullable(b.getPhoneKey()).orElse(""),
				java.util.Optional.ofNullable(b.getStripKey()).orElse(""))) {
			if (!key.isEmpty()) {
				storage.delete(key);
			}
		}
		return Map.of("deleted", true);
	}

	private void apply(BannerAd b, BannerRequest r) {
		if (r.startsAt() != null && r.endsAt() != null && !r.endsAt().isAfter(r.startsAt())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "DATES_INVALID", "The end must be after the start.");
		}
		b.setTitle(r.title().trim());
		b.setSubtitle(r.subtitle() == null || r.subtitle().isBlank() ? null : r.subtitle().trim());
		b.setLinkUrl(r.linkUrl() == null || r.linkUrl().isBlank() ? null : r.linkUrl().trim());
		b.setStartsAt(r.startsAt());
		b.setEndsAt(r.endsAt());
		if (r.active() != null) {
			b.setActive(r.active());
		}
		if (r.position() != null) {
			b.setPosition(r.position());
		}
		if (r.showInHero() != null) {
			b.setShowInHero(r.showInHero());
		}
		if (r.showInStrip() != null) {
			b.setShowInStrip(r.showInStrip());
		}
	}

	private BannerView view(BannerAd b) {
		String single = b.getImageKey() == null ? null : media.urlFor(b.getImageKey());
		String hero = b.getHeroKey() == null ? single : media.urlFor(b.getHeroKey());
		String phone = b.getPhoneKey() == null ? hero : media.urlFor(b.getPhoneKey());
		String strip = b.getStripKey() == null ? single : media.urlFor(b.getStripKey());
		return new BannerView(b.getId(), b.getTitle(), b.getSubtitle(), single, b.getLinkUrl(), b.getStartsAt(), b.getEndsAt(),
				b.isActive(), b.showing(Instant.now()), b.getPosition(), b.getClicks(),
				hero, phone, strip, b.isShowInHero(), b.isShowInStrip());
	}
}
