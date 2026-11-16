package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * scripts/seed/demo_seed.sql (generated from the demo catalog) can be run on a database that has the app's
 * migrations applied, runs twice without adding duplicates, and adds the same demo rows the loader does.
 */
class DemoSeedScriptIntegrationTest extends IntegrationTest {

	private static final Path SEED = Path.of("..", "scripts", "seed", "demo_seed.sql");

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void runningTheSeedTwiceAddsEachDemoRowOnce() throws Exception {
		String sql = Files.readString(SEED);
		try (var conn = dataSource.getConnection(); var st = conn.createStatement()) {
			st.execute(sql);
		}
		var first = counts();
		assertThat(first.products()).isGreaterThanOrEqualTo(780);
		assertThat(first.shops()).isGreaterThanOrEqualTo(17);
		assertThat(first.pros()).isGreaterThanOrEqualTo(10);
		assertThat(first.jobs()).isGreaterThanOrEqualTo(10);
		assertThat(first.talent()).isGreaterThanOrEqualTo(8);

		try (var conn = dataSource.getConnection(); var st = conn.createStatement()) {
			st.execute(sql);
		}
		assertThat(counts()).isEqualTo(first);
	}

	private Counts counts() {
		return new Counts(
				count("select count(*) from products where slug like 'demo-%'"),
				count("select count(*) from shops where slug like 'demo-%'"),
				count("select count(*) from pro_profiles pp join users u on u.id = pp.owner_id where u.email like 'demo-pro-%'"),
				count("select count(*) from job_posts where decided_by = 'demo data'"),
				count("select count(*) from talent_profiles tp join users u on u.id = tp.user_id where u.email like 'demo-talent-%'"));
	}

	private int count(String sql) {
		Integer n = jdbc.queryForObject(sql, Integer.class);
		return n == null ? 0 : n;
	}

	private record Counts(int products, int shops, int pros, int jobs, int talent) {
	}
}
