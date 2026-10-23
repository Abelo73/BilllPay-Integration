package et.tenapay.shop.config;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import et.tenapay.shop.user.TokenService;
import et.tenapay.shop.user.UserRepository;

@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.csrf(csrf -> csrf.disable())
				.cors(Customizer.withDefaults())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
						// Spring forwards errors here; blocking it turned every 404/400 into a 403
						.requestMatchers("/error").permitAll()
						// metrics for Prometheus: only from this machine / the Docker network, never through a proxy
						.requestMatchers("/actuator/prometheus").access(InternalNetwork::check)
						.requestMatchers("/api/auth/**", "/api/admin/auth/login").permitAll()
						// user management and login history: admins only
						.requestMatchers("/api/admin/users/**", "/api/admin/login-events/**").hasRole("ADMIN")
						// support staff can look at everything, only admins can change things (refunds, replays, ...)
						.requestMatchers(HttpMethod.GET, "/api/admin/**").hasAnyRole("ADMIN", "SUPPORT")
						.requestMatchers("/api/admin/**").hasRole("ADMIN")
						.requestMatchers("/api/me/**").authenticated()
						.requestMatchers("/api/**", "/actuator/health/**", "/actuator/info",
								"/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
						.anyRequest().denyAll())
				.oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
		return http.build();
	}

	/** Maps the token's "role" claim to ROLE_ADMIN / ROLE_SUPPORT / ROLE_CUSTOMER. */
	private static JwtAuthenticationConverter jwtAuthenticationConverter() {
		JwtGrantedAuthoritiesConverter roles = new JwtGrantedAuthoritiesConverter();
		roles.setAuthoritiesClaimName(TokenService.ROLE_CLAIM);
		roles.setAuthorityPrefix("ROLE_");
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(roles);
		return converter;
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(AppProperties props) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(props.corsOrigins());
		config.addAllowedMethod("*");
		config.addAllowedHeader("*");
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}

	@Bean
	SecretKey jwtKey(AppProperties props) {
		byte[] bytes = props.jwtSecret().getBytes(StandardCharsets.UTF_8);
		if (bytes.length < 32) {
			throw new IllegalStateException("JWT_SECRET must be at least 32 bytes");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey, UserRepository users) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(),
				sessionStillValid(users)));
		return decoder;
	}

	/**
	 * Refuses tokens of disabled users and tokens issued before the user's last password change, role change or
	 * "log out everywhere" (token_version moved on).
	 */
	private static OAuth2TokenValidator<Jwt> sessionStillValid(UserRepository users) {
		OAuth2Error revoked = new OAuth2Error("invalid_token", "Session ended, please sign in again", null);
		return jwt -> {
			Object tv = jwt.getClaims().get(TokenService.VERSION_CLAIM);
			UUID id;
			try {
				id = UUID.fromString(jwt.getSubject());
			} catch (RuntimeException e) {
				return OAuth2TokenValidatorResult.failure(revoked);
			}
			boolean ok = tv instanceof Number n && users.findById(id)
					.filter(u -> u.isEnabled() && u.getTokenVersion() == n.intValue())
					.isPresent();
			return ok ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(revoked);
		};
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}
}
