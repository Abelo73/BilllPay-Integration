package et.tenapay.shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.it.IntegrationTest;

class TenashopApplicationTests extends IntegrationTest {

	@Test
	void startsAndReportsHealthy() {
		Res health = get("/actuator/health");
		assertThat(health.status()).isEqualTo(200);
		assertThat(health.text("status")).isEqualTo("UP");
		// Flyway seed data is there
		assertThat(get("/api/categories").body().size()).isGreaterThan(0);
	}

}
