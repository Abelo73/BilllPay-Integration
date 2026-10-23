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

import et.tenapay.shop.common.ApiException;
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
		u.setFullName(req.fullName().trim());
		u.setPhone(req.phone() == null || req.phone().isBlank() ? null : CheckoutService.normalizePhone(req.phone()));
		return UserView.of(u);
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
