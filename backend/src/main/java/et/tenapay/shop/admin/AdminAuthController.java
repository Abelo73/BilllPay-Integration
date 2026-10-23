package et.tenapay.shop.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class AdminAuthController {

	private static final Duration TOKEN_TTL = Duration.ofHours(8);

	private final AppProperties app;
	private final JwtEncoder encoder;

	public record LoginRequest(@NotBlank String username, @NotBlank String password) {
	}

	public record LoginResponse(String token, Instant expiresAt) {
	}

	@PostMapping("/api/admin/auth/login")
	public LoginResponse login(@Valid @RequestBody LoginRequest req) {
		if (!(constantTimeEquals(req.username(), app.adminUsername())
				& constantTimeEquals(req.password(), app.adminPassword()))) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "Invalid username or password");
		}
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer("tenashop")
				.subject(req.username())
				.issuedAt(now)
				.expiresAt(now.plus(TOKEN_TTL))
				.claim("scope", "admin")
				.build();
		String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
		return new LoginResponse(token, now.plus(TOKEN_TTL));
	}

	private static boolean constantTimeEquals(String a, String b) {
		return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
	}
}
