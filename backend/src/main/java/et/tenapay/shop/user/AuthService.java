package et.tenapay.shop.user;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.order.CheckoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

	public enum Portal { SHOP, ADMIN }

	public static final int MAX_FAILED_LOGINS = 5;
	public static final Duration LOCK_DURATION = Duration.ofMinutes(15);
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Africa/Addis_Ababa"));

	private final UserRepository users;
	private final LoginEventRepository loginEvents;
	private final PasswordEncoder passwords;
	private final TokenService tokens;
	private final TransactionTemplate tx;
	private final et.tenapay.shop.notification.NotificationService notifications;

	/** Burned on unknown emails so a miss takes as long as a wrong password. */
	private String dummyHash;

	public record ClientInfo(String ip, String userAgent) {
	}

	public record UserView(UUID id, String email, String fullName, String phone, Role role) {

		public static UserView of(User u) {
			return new UserView(u.getId(), u.getEmail(), u.getFullName(), u.getPhone(), u.getRole());
		}
	}

	public record Session(String token, Instant expiresAt, UserView user) {
	}

	private record Attempt(User user, String reason) {
	}

	public static String normalizeEmail(String email) {
		return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
	}

	public Session login(String email, String password, Portal portal, ClientInfo client) {
		String normalized = normalizeEmail(email);
		Attempt attempt = tx.execute(s -> attempt(normalized, password, portal, client));
		switch (attempt.reason()) {
			case "SUCCESS" -> {
				return session(attempt.user());
			}
			case "LOCKED", "NOW_LOCKED" -> throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_LOCKED",
					"Too many failed sign-in attempts. Try again after " + TIME.format(attempt.user().getLockedUntil()) + ".",
					Map.of("lockedUntil", attempt.user().getLockedUntil()));
			case "DISABLED" -> throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED",
					"This account is disabled. Contact support.");
			default -> throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "Invalid email or password.");
		}
	}

	private Attempt attempt(String email, String password, Portal portal, ClientInfo client) {
		User user = email == null ? null : users.findByEmail(email).orElse(null);
		Attempt result;
		if (user == null) {
			passwords.matches(password, dummyHash());
			result = new Attempt(null, "UNKNOWN_EMAIL");
		} else if (user.isLocked()) {
			result = new Attempt(user, "LOCKED");
		} else if (!passwords.matches(password, user.getPasswordHash())) {
			user.setFailedLogins(user.getFailedLogins() + 1);
			if (user.getFailedLogins() >= MAX_FAILED_LOGINS) {
				user.setFailedLogins(0);
				user.setLockedUntil(Instant.now().plus(LOCK_DURATION));
				result = new Attempt(user, "NOW_LOCKED");
			} else {
				result = new Attempt(user, "WRONG_PASSWORD");
			}
		} else if ((portal == Portal.ADMIN) != user.getRole().isStaff()) {
			// Staff sign in on /admin, customers on the store; the other door looks like a bad password.
			result = new Attempt(user, "WRONG_PORTAL");
		} else if (!user.isEnabled()) {
			result = new Attempt(user, "DISABLED");
		} else {
			user.setFailedLogins(0);
			user.setLockedUntil(null);
			user.setLastLoginAt(Instant.now());
			result = new Attempt(user, "SUCCESS");
		}
		record(user, email, portal, result.reason().equals("SUCCESS"), result.reason(), client);
		return result;
	}

	public Session register(String fullName, String email, String phone, String password, ClientInfo client) {
		PasswordPolicy.check(password);
		String normalized = normalizeEmail(email);
		User user = tx.execute(s -> {
			if (users.existsByEmail(normalized)) {
				throw new ApiException(HttpStatus.CONFLICT, "EMAIL_TAKEN",
						"An account with this email already exists. Try signing in.");
			}
			User u = new User();
			u.setEmail(normalized);
			u.setFullName(fullName.trim());
			u.setPhone(phone == null || phone.isBlank() ? null : CheckoutService.normalizePhone(phone));
			u.setRole(Role.CUSTOMER);
			u.setPasswordHash(passwords.encode(password));
			u.setLastLoginAt(Instant.now());
			users.save(u);
			record(u, normalized, Portal.SHOP, true, "REGISTERED", client);
			return u;
		});
		return session(user);
	}

	/** Changes the password, signs out every other session, and returns a fresh token for this one. */
	public Session changePassword(UUID userId, String currentPassword, String newPassword) {
		PasswordPolicy.check(newPassword);
		User user = tx.execute(s -> {
			User u = users.findById(userId).orElseThrow(() -> ApiException.notFound("User"));
			if (!passwords.matches(currentPassword, u.getPasswordHash())) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "WRONG_PASSWORD", "Your current password is not correct.");
			}
			u.setPasswordHash(passwords.encode(newPassword));
			u.revokeSessions();
			return u;
		});
		// security email; sent in the background so a slow mail server doesn't hold up the response
		java.util.concurrent.CompletableFuture.runAsync(() -> notifications.onPasswordChanged(user.getId(),
				user.getTokenVersion(), user.getEmail(), user.getFullName()));
		return session(user);
	}

	public void logoutEverywhere(UUID userId) {
		tx.executeWithoutResult(s -> users.findById(userId).ifPresent(User::revokeSessions));
	}

	public Session session(User user) {
		TokenService.IssuedToken t = tokens.issue(user);
		return new Session(t.token(), t.expiresAt(), UserView.of(user));
	}

	private void record(User user, String email, Portal portal, boolean success, String reason, ClientInfo client) {
		LoginEvent e = new LoginEvent();
		e.setUserId(user == null ? null : user.getId());
		e.setEmail(email);
		e.setPortal(portal.name());
		e.setSuccess(success);
		e.setReason(reason);
		e.setIp(client == null ? null : client.ip());
		e.setUserAgent(client == null || client.userAgent() == null ? null
				: client.userAgent().substring(0, Math.min(300, client.userAgent().length())));
		loginEvents.save(e);
		if (!success) {
			log.info("Sign-in failed for {} on {}: {}", email, portal, reason);
		}
	}

	private String dummyHash() {
		if (dummyHash == null) {
			dummyHash = passwords.encode("not-a-real-password-1");
		}
		return dummyHash;
	}
}
