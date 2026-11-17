package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** An address can carry a pin on the map: both numbers or neither, and only the owner sees it. */
class AddressPinIntegrationTest extends IntegrationTest {

	private static Map<String, Object> address(Double lat, Double lng) {
		Map<String, Object> m = new HashMap<>();
		m.put("label", "Home");
		m.put("recipientName", "Pin Owner");
		m.put("phone", "0911223344");
		m.put("addressLine", "Near the market");
		m.put("city", "Wolaita Sodo");
		if (lat != null) {
			m.put("latitude", lat);
		}
		if (lng != null) {
			m.put("longitude", lng);
		}
		return m;
	}

	@Test
	void pinIsSavedWithBothNumbersOrNeither() {
		String token = shopperToken();

		// both numbers: saved and listed back
		Res ok = post("/api/me/addresses", address(6.8603, 37.7495), token);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		JsonNode list = ok.body();
		JsonNode withPin = list.get(list.size() - 1);
		assertThat(withPin.path("latitude").asDouble()).isEqualTo(6.8603, org.assertj.core.data.Offset.offset(0.0001));
		assertThat(withPin.path("longitude").asDouble()).isEqualTo(37.7495, org.assertj.core.data.Offset.offset(0.0001));

		// one number only: refused
		Res half = post("/api/me/addresses", address(6.86, null), token);
		assertThat(half.status()).isEqualTo(400);
		assertThat(half.body().path("code").asString()).isEqualTo("PIN_INCOMPLETE");

		// out of range: refused
		assertThat(post("/api/me/addresses", address(95.0, 37.7), token).status()).isEqualTo(400);

		// no pin: saved, with nothing set
		JsonNode plain = post("/api/me/addresses", address(null, null), token).body();
		assertThat(plain.get(plain.size() - 1).path("latitude").isNull()).isTrue();
	}
}
