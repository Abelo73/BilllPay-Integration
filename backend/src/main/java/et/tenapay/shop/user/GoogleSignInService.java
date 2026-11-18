package et.tenapay.shop.user;

import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.AuthService.ClientInfo;
import et.tenapay.shop.user.AuthService.Session;

/**
 * "Continue with Google". The browser gets a signed token from Google; this checks the signature against Google's
 * published keys, that the token was made for this app, and that Google has verified the email. Off until a Google
 * client id is set (app.google-client-id).
 */
@Service
public class GoogleSignInService {

	private static final String KEYS = "https://www.googleapis.com/oauth2/v3/certs";
	private static final String ISSUER = "https://accounts.google.com";

	private final String clientId;
	private final JwtDecoder decoder;
	private final AuthService auth;

	public GoogleSignInService(@Value("${app.google-client-id:}") String clientId, AuthService auth) {
		this.clientId = clientId == null ? "" : clientId.trim();
		this.auth = auth;
		if (this.clientId.isEmpty()) {
			this.decoder = null;
		} else {
			NimbusJwtDecoder d = NimbusJwtDecoder.withJwkSetUri(KEYS).build();
			d.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
					JwtValidators.createDefaultWithIssuer(ISSUER),
					new JwtClaimValidator<List<String>>(JwtClaimNames.AUD, aud -> aud != null && aud.contains(this.clientId))));
			this.decoder = d;
		}
	}

	public boolean enabled() {
		return decoder != null;
	}

	/** The public id the sign-in button needs (not a secret). Null when Google sign-in is off. */
	public String clientId() {
		return enabled() ? clientId : null;
	}

	public Session signIn(String credential, ClientInfo client) {
		if (!enabled()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "GOOGLE_OFF", "Sign in with Google is not turned on.");
		}
		Jwt jwt;
		try {
			jwt = decoder.decode(credential);
		} catch (JwtException e) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "GOOGLE_TOKEN_INVALID", "Google could not confirm this sign-in. Try again.");
		}
		String email = jwt.getClaimAsString("email");
		Boolean verified = jwt.getClaimAsBoolean("email_verified");
		if (email == null || !Boolean.TRUE.equals(verified)) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "GOOGLE_EMAIL_NOT_VERIFIED", "Your Google email is not verified. Verify it with Google, then try again.");
		}
		return auth.signInWithGoogle(jwt.getSubject(), email.toLowerCase(Locale.ROOT), jwt.getClaimAsString("name"), client);
	}
}
