package et.tenapay.shop.user;

import java.time.Duration;
import java.time.Instant;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** Issues signed session tokens. The "tv" claim must match the user's token_version or the token is refused. */
@Service
@RequiredArgsConstructor
public class TokenService {

	public static final String ROLE_CLAIM = "role";
	public static final String VERSION_CLAIM = "tv";

	private static final Duration STAFF_TTL = Duration.ofHours(8);
	private static final Duration CUSTOMER_TTL = Duration.ofDays(7);

	private final JwtEncoder encoder;

	public record IssuedToken(String token, Instant expiresAt) {
	}

	public IssuedToken issue(User user) {
		Instant now = Instant.now();
		Instant expires = now.plus(user.getRole().isStaff() ? STAFF_TTL : CUSTOMER_TTL);
		JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
				.issuer("tenashop")
				.subject(user.getId().toString())
				.issuedAt(now)
				.expiresAt(expires)
				.claim(ROLE_CLAIM, user.getRole().name())
				.claim(VERSION_CLAIM, user.getTokenVersion());
		// phone-only customers have no email; a null claim is not allowed
		if (user.getEmail() != null) {
			builder.claim("email", user.getEmail());
		}
		JwtClaimsSet claims = builder.build();
		String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
		return new IssuedToken(token, expires);
	}
}
