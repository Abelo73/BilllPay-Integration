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
	private final StaffTwoStepService twoStep;
	private final UserRepository users;

	/** {@code deviceToken}: staff only, a device trusted after a 2-step sign-in (skips the code). */
	public record LoginRequest(@NotBlank @Email String email, @NotBlank @Size(max = 200) String password, @Size(max = 200) String deviceToken) {
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

	/** {@code language}: the site language right now ("en" or "am"); the code SMS is written in it. */
	public record PhoneStartRequest(@NotBlank @Size(max = 30) String phone, @Size(max = 5) String language) {
	}

	public record PhoneVerifyRequest(@NotBlank @Size(max = 30) String phone, @NotBlank @Size(max = 12) String code,
			@Size(max = 200) String fullName) {
	}

	/** Step 1 of phone sign-in: text a 6-digit code to the number. */
	@PostMapping("/api/auth/phone/start")
	public PhoneAuthService.CodeSent phoneStart(@Valid @RequestBody PhoneStartRequest req, HttpServletRequest http) {
		return phoneAuth.sendCode(req.phone(), client(http), req.language());
	}

	/** Step 2: check the code and sign in (creating the account on a first sign-in, which needs fullName). */
	@PostMapping("/api/auth/phone/verify")
	public Session phoneVerify(@Valid @RequestBody PhoneVerifyRequest req, HttpServletRequest http) {
		return phoneAuth.verify(req.phone(), req.code(), req.fullName(), client(http));
	}

	public record StaffVerifyRequest(@jakarta.validation.constraints.NotNull java.util.UUID challengeId, @NotBlank @Size(max = 10) String code,
			boolean trustDevice) {
	}

	/** A staff session; {@code deviceToken} when the device was just trusted for 30 days. */
	public record StaffSession(String token, java.time.Instant expiresAt, AuthService.UserView user, String deviceToken) {
	}

	/**
	 * Staff sign-in. With 2-step on (Admin → Features) and no trusted device, the answer is a challenge
	 * ({@code twoStep: true}) and the session comes from {@code /api/admin/auth/verify} after the code.
	 */
	@PostMapping("/api/admin/auth/login")
	public Object staffLogin(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
		Session s = auth.login(req.email(), req.password(), Portal.ADMIN, client(http));
		if (!twoStep.required() || twoStep.trusted(s.user().id(), req.deviceToken())) {
			return new StaffSession(s.token(), s.expiresAt(), s.user(), null);
		}
		User user = users.findById(s.user().id()).orElseThrow();
		return twoStep.start(user, client(http).ip());
	}

	@PostMapping("/api/admin/auth/verify")
	public StaffSession staffVerify(@Valid @RequestBody StaffVerifyRequest req, HttpServletRequest http) {
		StaffTwoStepService.StaffSignIn in = twoStep.verify(req.challengeId(), req.code(), req.trustDevice(), http.getHeader("User-Agent"));
		return new StaffSession(in.session().token(), in.session().expiresAt(), in.session().user(), in.deviceToken());
	}

	static ClientInfo client(HttpServletRequest http) {
		String forwarded = http.getHeader("X-Forwarded-For");
		String ip = forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : http.getRemoteAddr();
		return new ClientInfo(ip, http.getHeader("User-Agent"));
	}
}
