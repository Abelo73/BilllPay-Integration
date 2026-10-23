package et.tenapay.shop.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;

class SlugsTest {

	@Test
	void slugifiesNamesIncludingAccents() {
		assertThat(Slugs.slugify("Handmade Clay Jebena!")).isEqualTo("handmade-clay-jebena");
		assertThat(Slugs.slugify("  Café — Crème  ")).isEqualTo("cafe-creme");
		assertThat(Slugs.slugify("20,000 mAh Power Bank")).isEqualTo("20-000-mah-power-bank");
		assertThat(Slugs.slugify("ቡና")).isEmpty(); // non-Latin only → caller's fallback
	}

	@Test
	void makesSlugsUnique() {
		Set<String> taken = Set.of("jebena", "jebena-2");
		assertThat(Slugs.unique("jebena", "product", taken::contains)).isEqualTo("jebena-3");
		assertThat(Slugs.unique("", "product", taken::contains)).isEqualTo("product");
		assertThat(Slugs.unique("new-item", "product", taken::contains)).isEqualTo("new-item");
	}
}
