package et.tenapay.shop.user;

import java.util.Map;

import org.springframework.http.HttpStatus;
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
	private final EmailCodeService emailCodes;
	private final et.tenapay.shop.config.AppProperties app;
	private final PhoneAuthService phoneAuth;
	@org.springframework.beans.factory.annotation.Value("${app.phone-sign-in:false}")
	private boolean phoneSignIn;
	private final StaffTwoStepService twoStep;
	private final UserRepository users;

	/** {@code deviceToken}: staff only, a device trusted after a 2-step sign-in (skips the code). */
	public record LoginRequest(@NotBlank @Email String email, @NotBlank @Size(max = 200) String password, @Size(max = 200) String deviceToken) {
	}

	public record RegisterRequest(
			@NotBlank @Size(max = 200) String fullName,
			@NotBlank @Email @Size(max = 200) String email,
			@Pattern(regexp = "^$|^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone,
			@NotBlank @Size(max = 200) String password,
			/** The 6-digit code emailed for this address (only with app.sign-up-email-code on). */
			@Size(max = 12) String code) {
	}

	/**
	 * Sign-up. With app.sign-up-email-code on, the first call (no code) checks the form, emails a 6-digit code and
	 * answers 422 EMAIL_CODE_SENT with where it went; the same form sent again with the code makes the account.
	 */
	@PostMapping("/api/auth/register")
	public Session register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
		if (app.signUpEmailCode()) {
			String email = AuthService.normalizeEmail(req.email());
			if (req.code() == null || req.code().isBlank()) {
				auth.checkCanRegister(email, req.password());
				EmailCodeService.CodeSent sent = emailCodes.send(email, client(http));
				java.util.Map<String, Object> details = new java.util.HashMap<>();
				details.put("maskedEmail", sent.maskedEmail());
				details.put("expiresInSeconds", sent.expiresInSeconds());
				details.put("resendInSeconds", sent.resendInSeconds());
				details.put("testMode", sent.testMode());
				if (sent.devCode() != null) {
					details.put("devCode", sent.devCode());
				}
				throw new et.tenapay.shop.common.ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT,
						"EMAIL_CODE_SENT", "We emailed you a 6-digit code. Type it to create your account.", details);
			}
			emailCodes.consume(email, req.code());
		}
		Session session = auth.register(req.fullName(), req.email(), req.phone(), req.password(), client(http));
		if (app.signUpEmailCode()) {
			auth.markEmailVerified(req.email()); // the code proved the address
		}
		return session;
	}

	public record EmailCodeRequest(@NotBlank @Email @Size(max = 200) String email) {
	}

	/** "Send a new code" on the sign-up page (with app.sign-up-email-code on). */
	@PostMapping("/api/auth/email/resend")
	public EmailCodeService.CodeSent emailResend(@Valid @RequestBody EmailCodeRequest req, HttpServletRequest http) {
		if (!app.signUpEmailCode()) {
			throw et.tenapay.shop.common.ApiException.notFound("Email codes");
		}
		String email = AuthService.normalizeEmail(req.email());
		if (users.existsByEmail(email)) {
			throw new et.tenapay.shop.common.ApiException(org.springframework.http.HttpStatus.CONFLICT, "EMAIL_TAKEN",
					"An account with this email already exists. Try signing in.");
		}
		return emailCodes.send(email, client(http));
	}

	public record PasswordResetRequest(@NotBlank @Email @Size(max = 200) String email, @NotBlank @Size(max = 12) String code,
			@NotBlank @Size(max = 200) String newPassword) {
	}

	/**
	 * Forgot password: emails a 6-digit code. The answer is the same whether or not the account exists, so this form
	 * cannot be used to find out who has an account.
	 */
	@PostMapping("/api/auth/password/forgot")
	public Map<String, Object> forgotPassword(@Valid @RequestBody EmailCodeRequest req, HttpServletRequest http) {
		String email = AuthService.normalizeEmail(req.email());
		Map<String, Object> answer = new java.util.HashMap<>();
		answer.put("message", "If an account uses this email, we've sent a 6-digit code to it. The code works for 5 minutes.");
		answer.put("expiresInSeconds", EmailCodeService.CODE_TTL.toSeconds());
		if (users.findByEmail(email).filter(User::isEnabled).isEmpty()) {
			return answer;
		}
		try {
			EmailCodeService.CodeSent sent = emailCodes.sendReset(email, client(http));
			if (sent.devCode() != null) {
				answer.put("devCode", sent.devCode());
			}
			answer.put("maskedEmail", sent.maskedEmail());
		} catch (et.tenapay.shop.common.ApiException limited) {
			// too soon or too many: the same answer, so the limit does not show who has an account
		}
		return answer;
	}

	/** Sets the new password with the emailed code. Every other device is signed out. */
	@PostMapping("/api/auth/password/reset")
	public Map<String, Object> resetPassword(@Valid @RequestBody PasswordResetRequest req, HttpServletRequest http) {
		String email = AuthService.normalizeEmail(req.email());
		emailCodes.consume(email, req.code());
		User user = users.findByEmail(email).filter(User::isEnabled)
				.orElseThrow(() -> new et.tenapay.shop.common.ApiException(HttpStatus.BAD_REQUEST, "CODE_EXPIRED", "This code has expired. Ask for a new one."));
		auth.setPasswordAfterReset(user.getId(), req.newPassword());
		return Map.of("reset", true, "message", "Your password is changed. Sign in with the new password.");
	}

	@PostMapping("/api/auth/login")
	public Session login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
		Session session = auth.login(req.email(), req.password(), Portal.SHOP, client(http));
		requireConfirmedEmail(req.email(), http);
		return session;
	}

	/**
	 * With email codes on, an email account confirms its email once. The password was right, so a code is emailed and
	 * the sign-in waits for it (POST /api/auth/email/confirm). Accounts made before this check are asked the same way.
	 */
	private void requireConfirmedEmail(String email, HttpServletRequest http) {
		if (!app.signUpEmailCode()) {
			return;
		}
		User u = users.findByEmail(AuthService.normalizeEmail(email)).orElse(null);
		if (u == null || u.getEmail() == null || u.getEmailVerifiedAt() != null || u.getRole().isStaff()) {
			return;
		}
		Map<String, Object> details = new java.util.HashMap<>();
		details.put("maskedEmail", EmailCodeService.mask(u.getEmail()));
		try {
			EmailCodeService.CodeSent sent = emailCodes.sendConfirm(u.getEmail(), client(http));
			details.put("expiresInSeconds", sent.expiresInSeconds());
			details.put("resendInSeconds", sent.resendInSeconds());
			if (sent.devCode() != null) {
				details.put("devCode", sent.devCode());
			}
		} catch (et.tenapay.shop.common.ApiException limited) {
			// a code went out a moment ago: its box is still shown, with the same wait
		}
		throw new et.tenapay.shop.common.ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
				"Confirm your email first. Enter the 6-digit code we sent you.", details);
	}

	public record ConfirmEmailRequest(@NotBlank @Email @Size(max = 200) String email, @NotBlank @Size(max = 200) String password,
			@NotBlank @Size(max = 12) String code) {
	}

	/** Confirms the email with the code, then signs in. The password is still checked. */
	@PostMapping("/api/auth/email/confirm")
	public Session confirmEmail(@Valid @RequestBody ConfirmEmailRequest req, HttpServletRequest http) {
		if (app.signUpEmailCode()) {
			emailCodes.consume(AuthService.normalizeEmail(req.email()), req.code());
			auth.markEmailVerified(req.email());
		}
		return auth.login(req.email(), req.password(), Portal.SHOP, client(http));
	}

	/** {@code language}: the site language right now ("en" or "am"); the code SMS is written in it. */
	public record PhoneStartRequest(@NotBlank @Size(max = 30) String phone, @Size(max = 5) String language) {
	}

	public record PhoneVerifyRequest(@NotBlank @Size(max = 30) String phone, @NotBlank @Size(max = 12) String code,
			@Size(max = 200) String fullName) {
	}

	/** Step 1 of phone sign-in: text a 6-digit code to the number. Off unless app.phone-sign-in is on. */
	@PostMapping("/api/auth/phone/start")
	public PhoneAuthService.CodeSent phoneStart(@Valid @RequestBody PhoneStartRequest req, HttpServletRequest http) {
		requirePhoneSignIn();
		return phoneAuth.sendCode(req.phone(), client(http), req.language());
	}

	/** Step 2: check the code and sign in (creating the account on a first sign-in, which needs fullName). */
	@PostMapping("/api/auth/phone/verify")
	public Session phoneVerify(@Valid @RequestBody PhoneVerifyRequest req, HttpServletRequest http) {
		requirePhoneSignIn();
		return phoneAuth.verify(req.phone(), req.code(), req.fullName(), client(http));
	}

	/** Phone sign-in and sign-up are switched off for now: email and password only. */
	private void requirePhoneSignIn() {
		if (!phoneSignIn) {
			throw et.tenapay.shop.common.ApiException.notFound("Phone sign-in");
		}
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
