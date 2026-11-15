package et.tenapay.shop.demo;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;

/**
 * Demo services (Hire a pro), job posts and talent profiles, from demo/marketplace.json.
 * Loaded and removed together with the demo catalog (Admin → Demo data).
 *
 * Every demo account has an email ending in {@value #DOMAIN} and no password, so nobody can sign in as one.
 * Items are found again by their email (pros, talent) or by employer and title (jobs), so loading twice does nothing.
 */
@Slf4j
final class DemoMarketplace {

	static final String DOMAIN = "@demo.sodogebeya.et";
	private static final ZoneId ADDIS = ZoneId.of("Africa/Addis_Ababa");

	private DemoMarketplace() {
	}

	/** Adds whatever is missing. Returns how many services, jobs and talent profiles were added. */
	static int load(JdbcTemplate jdbc, JsonNode m) {
		int added = 0;
		Timestamp now = Timestamp.from(Instant.now());
		for (JsonNode p : m.path("pros")) {
			String email = "demo-pro-" + p.path("slug").asString() + DOMAIN;
			if (exists(jdbc, "select count(*) from pro_profiles pp join users u on u.id = pp.owner_id where u.email = ?", email)) {
				continue;
			}
			UUID owner = demoUser(jdbc, email, p.path("display_name").asString(), p.path("phone").asString());
			jdbc.update("insert into pro_profiles (owner_id, display_name, trade, headline, bio, years_experience, areas, phone, "
					+ "status, decided_at, decided_by, jobs_done, rating_sum, rating_count, created_at, updated_at) "
					+ "values (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, 'demo data', ?, ?, ?, ?, ?)",
					owner, p.path("display_name").asString(), p.path("trade").asString(), text(p, "headline"), text(p, "bio"),
					p.path("years").asInt(), text(p, "areas"), p.path("phone").asString(), now,
					p.path("jobs_done").asInt(), p.path("rating_sum").asInt(), p.path("rating_count").asInt(), now, now);
			Long proId = jdbc.queryForObject("select id from pro_profiles where owner_id = ?", Long.class, owner);
			int position = 0;
			for (JsonNode price : p.path("prices")) {
				BigDecimal from = price.get(1) == null || price.get(1).isNull() ? null : new BigDecimal(price.get(1).asString("0"));
				jdbc.update("insert into pro_prices (pro_id, label, price_from, position) values (?, ?, ?, ?)",
						proId, price.get(0).asString(), from, position++);
			}
			added++;
		}

		for (JsonNode j : m.path("jobs")) {
			String employer = j.path("employer").asString();
			String title = j.path("title").asString();
			if (exists(jdbc, "select count(*) from job_posts where employer_name = ? and title = ?", employer, title)) {
				continue;
			}
			String employerEmail = "demo-employer-" + slug(employer) + DOMAIN;
			UUID employerId = demoUser(jdbc, employerEmail, employer, null);
			LocalDate deadline = LocalDate.now(ADDIS).plusDays(j.path("deadline_days").asLong(30));
			jdbc.update("insert into job_posts (employer_id, employer_name, title, place, job_type, field, salary_min, salary_max, "
					+ "salary_note, description, requirements, deadline, status, fee, fee_paid, featured, decided_by, decided_at, created_at, updated_at) "
					+ "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LIVE', 0, true, false, 'demo data', ?, ?, ?)",
					employerId, employer, title, j.path("place").asString(), j.path("job_type").asString(), text(j, "field"),
					money(j, "salary_min"), money(j, "salary_max"), text(j, "salary_note"), j.path("description").asString(),
					text(j, "requirements"), deadline, now, now, now);
			added++;
		}

		for (JsonNode t : m.path("talent")) {
			String email = "demo-talent-" + t.path("slug").asString() + DOMAIN;
			if (exists(jdbc, "select count(*) from talent_profiles tp join users u on u.id = tp.user_id where u.email = ?", email)) {
				continue;
			}
			UUID user = demoUser(jdbc, email, t.path("full_name").asString(), null);
			jdbc.update("insert into talent_profiles (user_id, full_name, status, headline, about, school, field_of_study, graduation_year, "
					+ "skills, languages, work_types, work_places, public_profile, created_at, updated_at) "
					+ "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?)",
					user, t.path("full_name").asString(), t.path("status").asString(), text(t, "headline"), text(t, "about"),
					text(t, "school"), text(t, "field_of_study"), t.hasNonNull("graduation_year") ? t.path("graduation_year").asInt() : null,
					text(t, "skills"), text(t, "languages"), text(t, "work_types"), text(t, "work_places"), now, now);
			added++;
		}
		log.info("Demo marketplace loaded: {} new services, jobs and talent profiles", added);
		return added;
	}

	/** Removes the demo services, jobs and talent. Ones that were used (quotes, applications) are hidden instead. */
	static void remove(JdbcTemplate jdbc, TransactionTemplate tx) {
		for (Long id : jdbc.queryForList("select jp.id from job_posts jp join users u on u.id = jp.employer_id where u.email like 'demo-employer-%'", Long.class)) {
			try {
				tx.executeWithoutResult(s -> jdbc.update("delete from job_posts where id = ?", id));
			} catch (DataAccessException used) {
				jdbc.update("update job_posts set status = 'CLOSED', status_note = 'Demo data removed' where id = ?", id);
			}
		}
		for (Long id : jdbc.queryForList("select tp.id from talent_profiles tp join users u on u.id = tp.user_id where u.email like 'demo-talent-%'", Long.class)) {
			try {
				tx.executeWithoutResult(s -> jdbc.update("delete from talent_profiles where id = ?", id));
			} catch (DataAccessException used) {
				jdbc.update("update talent_profiles set public_profile = false where id = ?", id);
			}
		}
		for (Long id : jdbc.queryForList("select pp.id from pro_profiles pp join users u on u.id = pp.owner_id where u.email like 'demo-pro-%'", Long.class)) {
			try {
				tx.executeWithoutResult(s -> jdbc.update("delete from pro_profiles where id = ?", id));
			} catch (DataAccessException used) {
				jdbc.update("update pro_profiles set status = 'SUSPENDED', status_note = 'Demo data removed' where id = ?", id);
			}
		}
		for (UUID id : jdbc.queryForList("select id from users where email like 'demo-%" + DOMAIN + "'", UUID.class)) {
			try {
				tx.executeWithoutResult(s -> jdbc.update("delete from users where id = ?", id));
			} catch (DataAccessException stillUsed) {
				// referenced by real records (for example a shop or an order): leave the account, it cannot sign in
			}
		}
	}

	private static UUID demoUser(JdbcTemplate jdbc, String email, String fullName, String phone) {
		UUID existing = jdbc.query("select id from users where email = ?", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, email);
		if (existing != null) {
			return existing;
		}
		UUID id = UUID.randomUUID();
		// no password, so this account cannot sign in
		jdbc.update("insert into users (id, email, password_hash, full_name, phone, role, enabled) values (?, ?, null, ?, ?, 'CUSTOMER', true)",
				id, email, fullName, phone);
		return id;
	}

	private static boolean exists(JdbcTemplate jdbc, String sql, Object... args) {
		Integer n = jdbc.queryForObject(sql, Integer.class, args);
		return n != null && n > 0;
	}

	private static String slug(String text) {
		return text.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
	}

	private static String text(JsonNode n, String field) {
		return n.hasNonNull(field) && !n.path(field).asString().isBlank() ? n.path(field).asString() : null;
	}

	private static BigDecimal money(JsonNode n, String field) {
		return n.hasNonNull(field) ? new BigDecimal(n.path(field).asString()) : null;
	}
}
