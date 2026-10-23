package et.tenapay.shop.admin;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.AuthService;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.LoginEvent;
import et.tenapay.shop.user.LoginEventRepository;
import et.tenapay.shop.user.PasswordPolicy;
import et.tenapay.shop.user.Role;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** User management for admins: list everyone, create staff, enable/disable, change role, reset, unlock. */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class UserAdminController {

	private final UserRepository users;
	private final LoginEventRepository loginEvents;
	private final PasswordEncoder passwords;

	public record UserRow(UUID id, String email, String fullName, String phone, String role, boolean enabled,
			boolean locked, Instant lockedUntil, Instant lastLoginAt, Instant createdAt) {

		static UserRow of(User u) {
			return new UserRow(u.getId(), u.getEmail(), u.getFullName(), u.getPhone(), u.getRole().name(),
					u.isEnabled(), u.isLocked(), u.getLockedUntil(), u.getLastLoginAt(), u.getCreatedAt());
		}
	}

	public record CreateStaff(@NotBlank @Email @Size(max = 200) String email, @NotBlank @Size(max = 200) String fullName,
			@NotNull Role role, @NotBlank @Size(max = 200) String password) {
	}

	public record UpdateUser(@Size(max = 200) String fullName, Role role, Boolean enabled) {
	}

	public record ResetPassword(@NotBlank @Size(max = 200) String newPassword) {
	}

	public record LoginEventRow(Long id, UUID userId, String email, String portal, boolean success, String reason,
			String ip, String userAgent, Instant createdAt) {

		static LoginEventRow of(LoginEvent e) {
			return new LoginEventRow(e.getId(), e.getUserId(), e.getEmail(), e.getPortal(), e.isSuccess(), e.getReason(),
					e.getIp(), e.getUserAgent(), e.getCreatedAt());
		}
	}

	@GetMapping("/users")
	@Transactional(readOnly = true)
	public PageDto<UserRow> list(@RequestParam(required = false) String kind, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		Set<Role> roles = "staff".equals(kind) ? EnumSet.of(Role.ADMIN, Role.SUPPORT)
				: "customers".equals(kind) ? EnumSet.of(Role.CUSTOMER) : EnumSet.allOf(Role.class);
		String query = q == null || q.isBlank() ? null : q.trim();
		return PageDto.of(users.search(roles, query, PageRequest.of(page, Math.min(size, 100),
				Sort.by("createdAt").descending())).map(UserRow::of));
	}

	@PostMapping("/users")
	@Transactional
	public UserRow createStaff(@Valid @RequestBody CreateStaff req) {
		if (!req.role().isStaff()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NOT_STAFF_ROLE", "Customers sign up on the store themselves.");
		}
		PasswordPolicy.check(req.password());
		String email = AuthService.normalizeEmail(req.email());
		if (users.existsByEmail(email)) {
			throw new ApiException(HttpStatus.CONFLICT, "EMAIL_TAKEN", "An account with this email already exists.");
		}
		User u = new User();
		u.setEmail(email);
		u.setFullName(req.fullName().trim());
		u.setRole(req.role());
		u.setPasswordHash(passwords.encode(req.password()));
		return UserRow.of(users.save(u));
	}

	@PatchMapping("/users/{id}")
	@Transactional
	public UserRow update(@PathVariable UUID id, @Valid @RequestBody UpdateUser req) {
		User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
		boolean self = u.getId().equals(CurrentUser.require().id());
		if (req.fullName() != null && !req.fullName().isBlank()) {
			u.setFullName(req.fullName().trim());
		}
		if (req.role() != null && req.role() != u.getRole()) {
			if (u.getRole().isStaff() != req.role().isStaff()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "ROLE_CHANGE_NOT_ALLOWED",
						"Customers and staff are separate accounts; create a staff account instead.");
			}
			if (self) {
				throw new ApiException(HttpStatus.CONFLICT, "SELF_CHANGE", "You can't change your own role.");
			}
			guardLastAdmin(u);
			u.setRole(req.role());
			u.revokeSessions();
		}
		if (req.enabled() != null && req.enabled() != u.isEnabled()) {
			if (self) {
				throw new ApiException(HttpStatus.CONFLICT, "SELF_CHANGE", "You can't disable your own account.");
			}
			if (!req.enabled()) {
				guardLastAdmin(u);
			}
			u.setEnabled(req.enabled());
			u.revokeSessions();
		}
		return UserRow.of(u);
	}

	@PostMapping("/users/{id}/reset-password")
	@Transactional
	public UserRow resetPassword(@PathVariable UUID id, @Valid @RequestBody ResetPassword req) {
		PasswordPolicy.check(req.newPassword());
		User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
		u.setPasswordHash(passwords.encode(req.newPassword()));
		u.setFailedLogins(0);
		u.setLockedUntil(null);
		u.revokeSessions();
		return UserRow.of(u);
	}

	@PostMapping("/users/{id}/unlock")
	@Transactional
	public UserRow unlock(@PathVariable UUID id) {
		User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
		u.setFailedLogins(0);
		u.setLockedUntil(null);
		return UserRow.of(u);
	}

	/** Signs the user out of every device. */
	@PostMapping("/users/{id}/revoke-sessions")
	@Transactional
	public UserRow revokeSessions(@PathVariable UUID id) {
		User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
		u.revokeSessions();
		return UserRow.of(u);
	}

	@GetMapping("/login-events")
	@Transactional(readOnly = true)
	public PageDto<LoginEventRow> loginEvents(@RequestParam(required = false) UUID userId,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
		PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
		return PageDto.of((userId == null ? loginEvents.findAll(pr) : loginEvents.findByUserId(userId, pr))
				.map(LoginEventRow::of));
	}

	/** Keeps at least one enabled admin, so nobody can lock everyone out of the admin. */
	private void guardLastAdmin(User u) {
		if (u.getRole() == Role.ADMIN && u.isEnabled() && users.countByRoleAndEnabledTrue(Role.ADMIN) <= 1) {
			throw new ApiException(HttpStatus.CONFLICT, "LAST_ADMIN", "This is the last active admin.");
		}
	}
}
