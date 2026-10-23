package et.tenapay.shop.user;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no enabled admin exists. */
@Slf4j
@Component
@RequiredArgsConstructor
public class StaffBootstrap implements ApplicationRunner {

	private final UserRepository users;
	private final PasswordEncoder passwords;
	private final AppProperties app;

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
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
		admin.setFullName("TenaShop Admin");
		admin.setRole(Role.ADMIN);
		admin.setPasswordHash(passwords.encode(app.adminPassword()));
		users.save(admin);
		log.info("Created first admin account {} from ADMIN_EMAIL/ADMIN_PASSWORD", email);
		if ("change-me".equals(app.adminPassword())) {
			log.warn("The first admin uses the default password 'change-me' — change it after signing in");
		}
	}
}
