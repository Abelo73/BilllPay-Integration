package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import et.tenapay.shop.demo.DemoCatalogService;

/**
 * The demo data (Admin → Demo data): every goods category gets at least 30 listings, the services, jobs and talent
 * profiles load, loading twice adds nothing, and removing and loading again brings everything back.
 */
class DemoCatalogIntegrationTest extends IntegrationTest {

	private static final List<String> GOODS = List.of("laptops", "desktop-computers", "tablets", "mobile-phones",
			"phone-accessories", "tvs", "kitchen-appliances", "tables", "sofas", "beds", "mattresses",
			"wardrobes-cabinets", "chairs", "clothing", "shoes", "beauty-health", "baby-kids", "sports-outdoors",
			"books-stationery", "vehicles", "pantry", "coffee-tea", "tools-construction", "commercial-equipment",
			"animals-pets", "business-industry");

	@Autowired
	private DemoCatalogService demo;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void everyGoodsCategoryHasThirtyListingsAndLoadingTwiceAddsNothing() {
		demo.load();
		Snapshot first = snapshot();

		for (String slug : GOODS) {
			assertThat(first.perCategory().getOrDefault(slug, 0))
					.as("listings in %s", slug).isGreaterThanOrEqualTo(30);
		}
		assertThat(first.services()).isEqualTo(10);
		assertThat(first.jobs()).isEqualTo(10);
		assertThat(first.talent()).isEqualTo(8);

		demo.load();
		assertThat(snapshot()).isEqualTo(first);
	}

	@Test
	void removeThenLoadBringsEverythingBack() {
		demo.load();
		Snapshot before = snapshot();
		demo.remove();
		demo.load();
		assertThat(snapshot().services()).isEqualTo(before.services());
		assertThat(snapshot().jobs()).isEqualTo(before.jobs());
		assertThat(snapshot().talent()).isEqualTo(before.talent());
	}

	private Snapshot snapshot() {
		var perCategory = new java.util.HashMap<String, Integer>();
		jdbc.query("select c.slug, count(p.id) n from products p join categories c on c.id = p.category_id "
				+ "where p.slug like 'demo-%' and p.active group by c.slug", rs -> {
					perCategory.put(rs.getString(1), rs.getInt(2));
				});
		int services = count("select count(*) from pro_profiles pp join users u on u.id = pp.owner_id "
				+ "where u.email like 'demo-pro-%' and pp.status = 'APPROVED'");
		int jobs = count("select count(*) from job_posts where decided_by = 'demo data' and status = 'LIVE'");
		int talent = count("select count(*) from talent_profiles tp join users u on u.id = tp.user_id "
				+ "where u.email like 'demo-talent-%' and tp.public_profile");
		return new Snapshot(perCategory, services, jobs, talent);
	}

	private int count(String sql) {
		Integer n = jdbc.queryForObject(sql, Integer.class);
		return n == null ? 0 : n;
	}

	private record Snapshot(java.util.Map<String, Integer> perCategory, int services, int jobs, int talent) {
	}
}
