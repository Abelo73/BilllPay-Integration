package et.tenapay.shop.order;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PhoneTest {

	@Test
	void normalizesEthiopianFormats() {
		assertThat(CheckoutService.normalizePhone("0911 204 471")).isEqualTo("+251911204471");
		assertThat(CheckoutService.normalizePhone("251911204471")).isEqualTo("+251911204471");
		assertThat(CheckoutService.normalizePhone("911204471")).isEqualTo("+251911204471");
	}

	@Test
	void comparesOnLastNineDigits() {
		assertThat(CheckoutService.samePhone("+251911204471", "0911-204-471")).isTrue();
		assertThat(CheckoutService.samePhone("+251911204471", "0911204472")).isFalse();
		assertThat(CheckoutService.samePhone("+251911204471", "4471")).isFalse();
	}
}
