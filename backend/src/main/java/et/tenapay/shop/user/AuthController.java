package et.tenapay.shop.user;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.user.AuthService.ClientInfo;
import et.tenapay.shop.user.AuthService.Portal;
import et.tenapay.shop.user.AuthService.Session;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Sign-up and sign-in for the store, and sign-in for the admin. Signing out is dropping the token client-side. */
@RestController
@RequiredArgsConstructor
public class AuthController {

	private final AuthService auth;

	public record LoginRequest(@NotBlank @Email String email, @NotBlank @Size(max = 200) String password) {
	}

	public record RegisterRequest(
			@NotBlank @Size(max = 200) String fullName,
			@NotBlank @Email @Size(max = 200) String email,
			@Pattern(regexp = "^$|^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone,
			@NotBlank @Size(max = 200) String password) {
	}

	@PostMapping("/api/auth/register")
	public Session register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
		return auth.register(req.fullName(), req.email(), req.phone(), req.password(), client(http));
	}

	@PostMapping("/api/auth/login")
	public Session login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
		return auth.login(req.email(), req.password(), Portal.SHOP, client(http));
	}

	@PostMapping("/api/admin/auth/login")
	public Session staffLogin(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
		return auth.login(req.email(), req.password(), Portal.ADMIN, client(http));
	}

	static ClientInfo client(HttpServletRequest http) {
		String forwarded = http.getHeader("X-Forwarded-For");
		String ip = forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : http.getRemoteAddr();
		return new ClientInfo(ip, http.getHeader("User-Agent"));
	}
}
