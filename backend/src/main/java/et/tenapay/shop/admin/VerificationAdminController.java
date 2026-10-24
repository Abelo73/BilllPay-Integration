package et.tenapay.shop.admin;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.seller.ShopViews.ShopDto;
import et.tenapay.shop.seller.Verification;
import et.tenapay.shop.seller.VerificationRepository;
import et.tenapay.shop.seller.VerificationService;
import et.tenapay.shop.seller.VerificationStatus;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Verification queue (design S21). Staff open the ID photos here; the images are never cached and never served
 * through the public media route. GET is open to Support, decisions need ADMIN (SecurityConfig).
 */
@RestController
@RequestMapping("/api/admin/verifications")
@RequiredArgsConstructor
public class VerificationAdminController {

	private final VerificationRepository verifications;
	private final VerificationService service;
	private final ShopRepository shops;
	private final UserRepository users;
	private final MediaProperties media;

	public record Row(Long id, String status, String idType, boolean idFront, boolean idBack, boolean selfie,
			boolean licence, String details, String staffNote, Instant submittedAt, Instant decidedAt, String decidedBy,
			ShopDto shop, String ownerName, boolean ownerPhoneVerified, Instant shopVerifiedAt) {
	}

	public record ListView(Map<String, Long> counts, PageDto<Row> page) {
	}

	public record DecisionRequest(@NotNull VerificationStatus status, @Size(max = 500) String note) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public ListView list(@RequestParam(defaultValue = "SUBMITTED") VerificationStatus status,
			@RequestParam(defaultValue = "0") int page) {
		// oldest first while waiting, so nobody waits forever
		Sort sort = status == VerificationStatus.SUBMITTED ? Sort.by("submittedAt").ascending() : Sort.by("id").descending();
		Map<String, Long> counts = new LinkedHashMap<>();
		for (VerificationStatus s : VerificationStatus.values()) {
			if (s != VerificationStatus.DRAFT) {
				counts.put(s.name(), verifications.countByStatus(s));
			}
		}
		return new ListView(counts, PageDto.of(verifications.findByStatus(status, PageRequest.of(page, 20, sort)).map(this::row)));
	}

	@GetMapping("/{id}/photos/{photo}")
	public ResponseEntity<byte[]> photo(@PathVariable Long id, @PathVariable String photo) {
		Verification v = verifications.findById(id).orElseThrow(() -> ApiException.notFound("Verification"));
		Verification.Photo which;
		try {
			which = Verification.Photo.valueOf(photo.toUpperCase().replace('-', '_'));
		} catch (IllegalArgumentException e) {
			throw ApiException.notFound("Photo");
		}
		return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore())
				.body(service.photo(v, which));
	}

	@PostMapping("/{id}/decision")
	public Row decide(@PathVariable Long id, @Valid @RequestBody DecisionRequest req) {
		String by = CurrentUser.get().map(CurrentUser::email).orElse("staff");
		return row(service.decide(id, req.status(), req.note(), by));
	}

	private Row row(Verification v) {
		Shop shop = shops.findById(v.getShopId()).orElseThrow();
		User owner = users.findById(shop.getOwnerId()).orElse(null);
		return new Row(v.getId(), v.getStatus().name(), v.getIdType().name(), v.getIdFrontKey() != null,
				v.getIdBackKey() != null, v.getSelfieKey() != null, v.getLicenceKey() != null, v.getDetails(),
				v.getStaffNote(), v.getSubmittedAt(), v.getDecidedAt(), v.getDecidedBy(), ShopDto.of(shop, media),
				owner == null ? null : owner.getFullName(), owner != null && owner.isPhoneVerified(), shop.getVerifiedAt());
	}
}
