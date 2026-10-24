package et.tenapay.shop.payment.billpay;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.payment.billpay.BillPayProperties.Credentials;
import et.tenapay.shop.payment.billpay.BillPayProperties.Verification;
import et.tenapay.shop.user.Role;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.extern.slf4j.Slf4j;

/**
 * Which BillPay new orders are paid through: sandbox (test money) or live (real money). Admins switch it in
 * Admin → BillPay setup; the choice is stored in {@code app_settings} and takes effect at once, no restart. Orders
 * already placed keep the environment they were created in ({@code orders.environment}).
 * <p>
 * Live is only allowed when it is safe: live key and webhook secret set, signatures enforced, https return links and
 * no admin still on a well-known password. If the saved mode is live but that no longer holds at startup, the shop
 * runs on the sandbox and the dashboard says why.
 */
@Slf4j
@Component
@Order(10) // after StaffBootstrap, which may replace the default admin password
public class BillPayMode implements ApplicationRunner {

	static final String SETTING = "billpay.mode";

	private final BillPayProperties props;
	private final AppProperties app;
	private final JdbcTemplate jdbc;
	private final UserRepository users;
	private final PasswordEncoder passwords;

	private volatile State state;

	public record State(BillPayEnvironment mode, String changedBy, Instant changedAt, String fallbackReason) {
	}

	public record EnvironmentStatus(String baseUrl, boolean apiKeyConfigured, String apiKeyHint,
			boolean webhookSecretConfigured, List<String> problems) {
	}

	public record Status(BillPayEnvironment mode, String changedBy, Instant changedAt, String fallbackReason,
			Map<BillPayEnvironment, EnvironmentStatus> environments) {
	}

	public BillPayMode(BillPayProperties props, AppProperties app, JdbcTemplate jdbc, UserRepository users,
			PasswordEncoder passwords) {
		this.props = props;
		this.app = app;
		this.jdbc = jdbc;
		this.users = users;
		this.passwords = passwords;
	}

	/** The environment new orders use. */
	public BillPayEnvironment current() {
		return state().mode();
	}

	public boolean isSandbox() {
		return current() == BillPayEnvironment.SANDBOX;
	}

	/** On startup: a saved live mode that is no longer safe falls back to the sandbox (nobody pays real money). */
	@Override
	public void run(ApplicationArguments args) {
		State loaded = state();
		log.info("BillPay mode: {}{}", loaded.mode(), loaded.changedBy() == null ? " (from BILLPAY_MODE)"
				: " (set by " + loaded.changedBy() + ")");
		if (loaded.mode() == BillPayEnvironment.LIVE) {
			List<String> problems = problems(BillPayEnvironment.LIVE);
			if (!problems.isEmpty()) {
				String reason = "Live is selected but not safe to use: " + String.join("; ", problems);
				log.error("{} — running on the BillPay SANDBOX until this is fixed (Admin → BillPay setup)", reason);
				state = new State(BillPayEnvironment.SANDBOX, loaded.changedBy(), loaded.changedAt(), reason);
			}
		}
	}

	/** Switches new orders to {@code target}. Refused (409) while that environment isn't ready. */
	public synchronized State switchTo(BillPayEnvironment target, String actor) {
		List<String> problems = problems(target);
		if (!problems.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "MODE_NOT_READY",
					"Can't switch to " + target.name().toLowerCase() + ": " + String.join("; ", problems),
					Map.of("problems", problems));
		}
		Instant now = Instant.now();
		jdbc.update("""
				insert into app_settings (key, value, updated_at, updated_by) values (?, ?, ?, ?)
				on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at,
				    updated_by = excluded.updated_by
				""", SETTING, target.name(), java.sql.Timestamp.from(now), actor);
		state = new State(target, actor, now, null);
		log.warn("BillPay mode switched to {} by {}", target, actor);
		return state;
	}

	public Status status() {
		State s = state();
		Map<BillPayEnvironment, EnvironmentStatus> envs = new java.util.EnumMap<>(BillPayEnvironment.class);
		for (BillPayEnvironment env : BillPayEnvironment.values()) {
			Credentials c = props.credentials(env);
			envs.put(env, new EnvironmentStatus(c.baseUrl(), c.hasApiKey(), hint(c.apiKey()), c.hasWebhookSecret(),
					problems(env)));
		}
		return new Status(s.mode(), s.changedBy(), s.changedAt(), s.fallbackReason(), envs);
	}

	/** What stops {@code env} from being used; empty when it's ready. */
	public List<String> problems(BillPayEnvironment env) {
		List<String> problems = new ArrayList<>();
		Credentials c = props.credentials(env);
		String prefix = "BILLPAY_" + env.name() + "_";
		if (c.baseUrl() == null || c.baseUrl().isBlank()) {
			problems.add(prefix + "BASE_URL is not set in .env");
		}
		if (!c.hasApiKey()) {
			problems.add(prefix + "API_KEY is not set in .env");
		}
		if (env == BillPayEnvironment.LIVE) {
			if (!c.hasWebhookSecret()) {
				problems.add(prefix + "WEBHOOK_SECRET is not set in .env (BillPay dashboard, Live → Webhooks)");
			} else if (c.webhookSecret().trim().equals(props.sandbox().webhookSecret() == null ? null
					: props.sandbox().webhookSecret().trim())) {
				problems.add(prefix + "WEBHOOK_SECRET is the same as the sandbox one; copy it from the dashboard"
						+ " with the Live toggle on");
			}
			if (props.webhook().verification() != Verification.HMAC_SHA256) {
				problems.add("webhook signatures aren't enforced (set BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256)");
			}
			String redirect = app.redirectBaseUrl();
			if (redirect == null || !redirect.startsWith("https://")) {
				problems.add("APP_REDIRECT_BASE_URL must be an https address BillPay can send shoppers back to");
			}
			for (String email : adminsWithKnownPassword()) {
				problems.add("admin " + email + " still uses a well-known password; change it (Admin → My account)");
			}
		}
		return problems;
	}

	private List<String> adminsWithKnownPassword() {
		List<String> weak = new ArrayList<>();
		for (User admin : users.findByRoleAndEnabledTrue(Role.ADMIN)) {
			if (et.tenapay.shop.user.PasswordPolicy.KNOWN.stream().anyMatch(p -> passwords.matches(p, admin.getPasswordHash()))) {
				weak.add(admin.getEmail());
			}
		}
		return weak;
	}

	private State state() {
		State s = state;
		if (s == null) {
			synchronized (this) {
				if (state == null) {
					state = load();
				}
				s = state;
			}
		}
		return s;
	}

	private State load() {
		List<State> saved = jdbc.query("select value, updated_by, updated_at from app_settings where key = ?",
				(rs, n) -> new State(BillPayEnvironment.valueOf(rs.getString("value")), rs.getString("updated_by"),
						rs.getTimestamp("updated_at").toInstant(), null),
				SETTING);
		if (!saved.isEmpty()) {
			return saved.get(0);
		}
		return new State(props.mode() == null ? BillPayEnvironment.SANDBOX : props.mode(), null, null, null);
	}

	private static String hint(String key) {
		return key == null || key.length() < 16 ? null : key.substring(0, 9) + "…" + key.substring(key.length() - 4);
	}
}
