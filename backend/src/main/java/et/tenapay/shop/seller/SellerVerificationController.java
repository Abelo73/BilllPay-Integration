package et.tenapay.shop.seller;

import java.io.IOException;
import java.time.Instant;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.seller.Verification.IdType;
import et.tenapay.shop.seller.Verification.Photo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** The seller's own verification request (design S18). Photos come back only to their owner, never cached. */
@RestController
@RequestMapping("/api/seller/verification")
@RequiredArgsConstructor
public class SellerVerificationController {

	private final ShopService shopService;
	private final VerificationService verifications;

	/** {@code photos}: which photos are uploaded (the images themselves are fetched one by one). */
	public record VerificationDto(Long id, String status, String idType, boolean idFront, boolean idBack, boolean selfie,
			boolean licence, String details, String staffNote, Instant submittedAt, Instant decidedAt,
			Instant shopVerifiedAt) {

		static VerificationDto of(Verification v, Shop shop) {
			if (v == null) {
				return new VerificationDto(null, "NONE", IdType.FAYDA.name(), false, false, false, false, null, null,
						null, null, shop.getVerifiedAt());
			}
			return new VerificationDto(v.getId(), v.getStatus().name(), v.getIdType().name(), v.getIdFrontKey() != null,
					v.getIdBackKey() != null, v.getSelfieKey() != null, v.getLicenceKey() != null, v.getDetails(),
					v.getStaffNote(), v.getSubmittedAt(), v.getDecidedAt(), shop.getVerifiedAt());
		}
	}

	public record DetailsRequest(IdType idType, @Size(max = 1000) String details) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public VerificationDto get() {
		Shop shop = shopService.requireMine();
		return VerificationDto.of(verifications.latest(shop.getId()), shop);
	}

	@PutMapping
	public VerificationDto details(@Valid @RequestBody DetailsRequest req) {
		Shop shop = shopService.requireMine();
		return VerificationDto.of(verifications.details(shop, req.idType(), req.details()), shop);
	}

	@PostMapping(path = "/photos/{photo}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public VerificationDto upload(@PathVariable String photo, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo to upload.");
		}
		Shop shop = shopService.requireMine();
		return VerificationDto.of(verifications.upload(shop, parsePhoto(photo), file.getBytes()), shop);
	}

	@GetMapping("/photos/{photo}")
	public ResponseEntity<byte[]> photoFile(@PathVariable String photo) {
		Shop shop = shopService.requireMine();
		Verification v = verifications.latest(shop.getId());
		if (v == null) {
			throw ApiException.notFound("Photo");
		}
		return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore())
				.body(verifications.photo(v, parsePhoto(photo)));
	}

	@PostMapping("/submit")
	public VerificationDto submit() {
		Shop shop = shopService.requireMine();
		return VerificationDto.of(verifications.submit(shop), shop);
	}

	/** URL form (id-front, id-back, selfie, licence) to enum. */
	static Photo parsePhoto(String name) {
		try {
			return Photo.valueOf(name.toUpperCase().replace('-', '_'));
		} catch (IllegalArgumentException e) {
			throw ApiException.notFound("Photo");
		}
	}
}
