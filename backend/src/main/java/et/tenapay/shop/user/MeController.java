package et.tenapay.shop.user;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.order.CheckoutService;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.user.AuthService.Session;
import et.tenapay.shop.user.AuthService.UserView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** The signed-in user's own account. */
@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

	private final UserRepository users;
	private final OrderRepository orders;
	private final AuthService auth;
	private final ImageProcessor images;
	private final MediaStorage storage;

	public record ProfileUpdate(@NotBlank @Size(max = 200) String fullName,
			@Pattern(regexp = "^$|^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone) {
	}

	public record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(max = 200) String newPassword) {
	}

	public record OrderSummary(String orderNumber, String status, BigDecimal total, String currency, int itemCount,
			Instant createdAt, Instant paidAt) {

		static OrderSummary of(Order o) {
			return new OrderSummary(o.getOrderNumber(), o.getStatus().name(), o.getTotal(), o.getCurrency(),
					o.getItems().stream().mapToInt(i -> i.getQuantity()).sum(), o.getCreatedAt(), o.getPaidAt());
		}
	}

	@GetMapping
	public UserView me() {
		return UserView.of(load());
	}

	@PatchMapping
	@Transactional
	public UserView update(@Valid @RequestBody ProfileUpdate req) {
		User u = load();
		String phone = req.phone() == null || req.phone().isBlank() ? null : CheckoutService.normalizePhone(req.phone());
		// a proven phone is how this person signs in; changing it needs a new code (not built yet), so it stays
		if (u.isPhoneVerified() && !java.util.Objects.equals(phone, u.getPhone())) {
			throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "PHONE_LOCKED",
					"You sign in with " + u.getPhone() + ", so it can't be changed here yet.");
		}
		u.setFullName(req.fullName().trim());
		u.setPhone(phone);
		return UserView.of(u);
	}

	/** The profile picture: square, re-encoded (camera data is dropped). Replaces the old one. */
	@PostMapping(path = "/avatar", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
	@Transactional
	public UserView uploadAvatar(@org.springframework.web.bind.annotation.RequestPart("file") org.springframework.web.multipart.MultipartFile file)
			throws java.io.IOException {
		if (file.isEmpty()) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a picture.");
		}
		User u = load();
		ImageProcessor.Processed img = images.process(file.getBytes());
		// avatars/<number>/<name>.jpg: the public media route serves only this shape (see MediaController.SAFE_KEY)
		String key = "avatars/" + Instant.now().toEpochMilli() + "/" + java.util.UUID.randomUUID().toString().toLowerCase() + ".jpg";
		storage.put(key, img.large(), "image/jpeg");
		String old = u.getAvatarKey();
		u.setAvatarKey(key);
		if (old != null) {
			storage.delete(old);
		}
		return UserView.of(u);
	}

	@org.springframework.web.bind.annotation.DeleteMapping("/avatar")
	@Transactional
	public UserView removeAvatar() {
		User u = load();
		String old = u.getAvatarKey();
		u.setAvatarKey(null);
		if (old != null) {
			storage.delete(old);
		}
		return UserView.of(u);
	}

	/** What others see on the public profile. Bio and area are optional; the switch decides whether anyone sees it. */
	public record PublicProfileUpdate(boolean profilePublic, @jakarta.validation.constraints.Size(max = 300) String bio,
			@jakarta.validation.constraints.Size(max = 120) String area) {
	}

	@org.springframework.web.bind.annotation.PutMapping("/public-profile")
	@Transactional
	public UserView publicProfile(@jakarta.validation.Valid @RequestBody PublicProfileUpdate req) {
		User u = load();
		u.setProfilePublic(req.profilePublic());
		u.setBio(req.bio() == null || req.bio().isBlank() ? null : req.bio().trim());
		u.setArea(req.area() == null || req.area().isBlank() ? null : req.area().trim());
		return UserView.of(u);
	}

	public record LanguageUpdate(@NotBlank @Pattern(regexp = "en|am", message = "must be en or am") String language) {
	}

	/** Remembers the site language, so SMS and alerts come in it. */
	@org.springframework.web.bind.annotation.PutMapping("/language")
	@Transactional
	public Map<String, String> language(@Valid @RequestBody LanguageUpdate req) {
		User u = load();
		u.setLanguage(et.tenapay.shop.sms.SmsLanguage.normalize(req.language()));
		return Map.of("language", u.getLanguage());
	}

	@PostMapping("/password")
	public Session changePassword(@Valid @RequestBody PasswordChange req) {
		return auth.changePassword(CurrentUser.require().id(), req.currentPassword(), req.newPassword());
	}

	/** Signs out every device, including this one. */
	@PostMapping("/logout-all")
	public Map<String, Object> logoutEverywhere() {
		auth.logoutEverywhere(CurrentUser.require().id());
		return Map.of("signedOut", true);
	}

	@GetMapping("/orders")
	@Transactional(readOnly = true)
	public PageDto<OrderSummary> myOrders(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "10") int size) {
		return PageDto.of(orders.findByUserId(CurrentUser.require().id(),
				PageRequest.of(page, Math.min(size, 50), Sort.by("createdAt").descending())).map(OrderSummary::of));
	}

	private User load() {
		return users.findById(CurrentUser.require().id()).orElseThrow(() -> ApiException.notFound("User"));
	}
}
