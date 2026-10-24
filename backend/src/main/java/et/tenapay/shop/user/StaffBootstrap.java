package et.tenapay.shop.user;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no enabled admin exists, and replaces a well-known
 * admin password ('change-me', or the example from the setup notes) with ADMIN_PASSWORD once that is set to something
 * else, so the password can be fixed without signing in. Live BillPay mode stays refused while a well-known password
 * is in use (BillPayMode).
 */
@Slf4j
@Component
@Order(0) // before BillPayMode checks whether live is safe
@RequiredArgsConstructor
public class StaffBootstrap implements ApplicationRunner {

	private final UserRepository users;
	private final PasswordEncoder passwords;
	private final AppProperties app;

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		createFirstAdmin();
		replaceKnownPasswordFromEnv();
	}

	private void replaceKnownPasswordFromEnv() {
		String wanted = app.adminPassword();
		if (wanted == null || PasswordPolicy.KNOWN.contains(wanted)) {
			if (wanted != null && !"change-me".equals(wanted)) {
				log.warn("ADMIN_PASSWORD in .env is the example from the setup notes; choose your own");
			}
			return;
		}
		try {
			PasswordPolicy.check(wanted);
		} catch (RuntimeException weak) {
			log.warn("ADMIN_PASSWORD in .env is too weak (8+ characters with a letter and a number); not applied");
			return;
		}
		for (User admin : users.findByRoleAndEnabledTrue(Role.ADMIN)) {
			if (PasswordPolicy.KNOWN.stream().anyMatch(p -> passwords.matches(p, admin.getPasswordHash()))) {
				admin.setPasswordHash(passwords.encode(wanted));
				admin.revokeSessions();
				users.save(admin);
				log.info("Admin {} had a well-known password; replaced it with ADMIN_PASSWORD from .env", admin.getEmail());
			}
		}
	}

	private void createFirstAdmin() {
		if (users.countByRoleAndEnabledTrue(Role.ADMIN) > 0) {
			return;
		}
		String email = AuthService.normalizeEmail(app.adminEmail());
		if (users.existsByEmail(email)) {
			log.warn("No enabled ADMIN exists and {} is already taken by another account; create an admin manually", email);
			return;
		}
		User admin = new User();
		admin.setEmail(email);
		admin.setFullName("Sodo Gebeya Admin");
		admin.setRole(Role.ADMIN);
		admin.setPasswordHash(passwords.encode(app.adminPassword()));
		users.save(admin);
		log.info("Created first admin account {} from ADMIN_EMAIL/ADMIN_PASSWORD", email);
		if ("change-me".equals(app.adminPassword())) {
			log.warn("The first admin uses the default password 'change-me' — change it after signing in");
		}
	}
}
