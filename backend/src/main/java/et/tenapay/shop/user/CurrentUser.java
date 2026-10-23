package et.tenapay.shop.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import et.tenapay.shop.common.ApiException;

/** The signed-in user of the current request, if any (from the validated bearer token). */
public record CurrentUser(UUID id, Role role) {

	public static Optional<CurrentUser> get() {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
			return Optional.empty();
		}
		return Optional.of(new CurrentUser(UUID.fromString(jwt.getSubject()),
				Role.valueOf(jwt.getClaimAsString(TokenService.ROLE_CLAIM))));
	}

	public static CurrentUser require() {
		return get().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Please sign in"));
	}

	/** The signed-in customer's id, for linking orders; staff and guests get empty. */
	public static Optional<UUID> customerId() {
		return get().filter(u -> u.role() == Role.CUSTOMER).map(CurrentUser::id);
	}
}
