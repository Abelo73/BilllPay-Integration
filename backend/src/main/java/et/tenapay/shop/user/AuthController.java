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
	private final PhoneAuthService phoneAuth;

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

	public record PhoneStartRequest(@NotBlank @Size(max = 30) String phone) {
	}

	public record PhoneVerifyRequest(@NotBlank @Size(max = 30) String phone, @NotBlank @Size(max = 12) String code,
			@Size(max = 200) String fullName) {
	}

	/** Step 1 of phone sign-in: text a 6-digit code to the number. */
	@PostMapping("/api/auth/phone/start")
	public PhoneAuthService.CodeSent phoneStart(@Valid @RequestBody PhoneStartRequest req, HttpServletRequest http) {
		return phoneAuth.sendCode(req.phone(), client(http));
	}

	/** Step 2: check the code and sign in (creating the account on a first sign-in, which needs fullName). */
	@PostMapping("/api/auth/phone/verify")
	public Session phoneVerify(@Valid @RequestBody PhoneVerifyRequest req, HttpServletRequest http) {
		return phoneAuth.verify(req.phone(), req.code(), req.fullName(), client(http));
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
