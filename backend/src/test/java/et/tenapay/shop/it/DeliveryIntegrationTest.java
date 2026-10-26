package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Sodo Gebeya M21: delivery fee per area of Sodo, partner riders, the rider shown to the buyer. */
class DeliveryIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0922556677";

	private String admin;
	private long productId;
	private String area;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("900.00"), 10);
		area = unique("Zone");
		JsonNode list = post("/api/admin/areas", Map.of("name", area), admin).body();
		long areaId = 0;
		for (JsonNode a : list) {
			if (a.path("name").asString().equals(area)) {
				areaId = a.path("id").asLong();
			}
		}
		Res fee = put("/api/admin/areas/" + areaId + "/delivery-fee", Map.of("fee", 40), admin);
		assertThat(fee.status()).as(fee.raw()).isEqualTo(200);
	}

	private Map<String, Object> body(String areaName) {
		return Map.of(
				"items", List.of(Map.of("productId", productId, "quantity", 1)),
				"customer", Map.of("name", "Zone Buyer", "phone", PHONE, "email", "zone@it.test"),
				"delivery", Map.of("address", "Near the stadium", "city", "Wolaita Sodo", "notes", "", "area", areaName));
	}

	private JsonNode status(String orderNumber) {
		return get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).body();
	}

	@Test
	void anAreaWithItsOwnFeeSetsTheDeliveryFee() {
		JsonNode delivery = get("/api/delivery").body();
		JsonNode mine = null;
		for (JsonNode a : delivery.path("areas")) {
			if (a.path("name").asString().equals(area)) {
				mine = a;
			}
		}
		assertThat(mine).isNotNull();
		assertThat(mine.path("fee").decimalValue()).isEqualByComparingTo("40");

		Map<String, Object> items = Map.of("items", List.of(Map.of("productId", productId, "quantity", 1)));
		JsonNode standard = post("/api/checkout/quote", items).body();
		assertThat(standard.path("deliveryFee").decimalValue()).isEqualByComparingTo("150");
		JsonNode zoned = post("/api/checkout/quote", Map.of("items", items.get("items"), "area", area.toLowerCase())).body();
		assertThat(zoned.path("deliveryFee").decimalValue()).isEqualByComparingTo("40");

		// over the free-delivery amount, the area fee is waived too
		JsonNode big = post("/api/checkout/quote", Map.of("items", List.of(Map.of("productId", productId, "quantity", 4)),
				"area", area)).body();
		assertThat(big.path("deliveryFee").decimalValue()).isEqualByComparingTo("0");

		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res r = post("/api/checkout", body(area));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		JsonNode s = status(r.text("orderNumber"));
		assertThat(s.path("deliveryFee").decimalValue()).isEqualByComparingTo("40");
		assertThat(s.path("total").decimalValue()).isEqualByComparingTo("940");
	}

	@Test
	void staffPutARiderOnAParcelAndTheBuyerSeesThemOnceItsOnTheWay() {
		Res rider = post("/api/admin/riders", Map.of("name", "Dawit K.", "phone", "0911 456 789", "note", "Bajaj"), admin);
		assertThat(rider.status()).as(rider.raw()).isEqualTo(200);
		long riderId = rider.body().path("id").asLong();
		assertThat(rider.text("phone")).isEqualTo("+251911456789");
		assertThat(post("/api/admin/riders", Map.of("name", "No phone"), admin).status()).isEqualTo(400);

		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = post("/api/checkout", body(area)).text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("940.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(status(orderNumber).path("status").asString())
				.isEqualTo("PAID"));

		Res assigned = put("/api/admin/orders/" + orderNumber + "/parcels/1/rider", Map.of("riderId", riderId), admin);
		assertThat(assigned.status()).as(assigned.raw()).isEqualTo(200);
		JsonNode detail = get("/api/admin/orders/" + orderNumber, admin).body();
		assertThat(detail.path("parcels").get(0).path("riderName").asString()).isEqualTo("Dawit K. (+251911456789)");

		// not shown before it leaves
		assertThat(status(orderNumber).path("parcels").get(0).path("rider").isNull()).isTrue();
		post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "SHIPPED"), admin);
		JsonNode onTheWay = status(orderNumber).path("parcels").get(0).path("rider");
		assertThat(onTheWay.path("name").asString()).isEqualTo("Dawit K.");
		assertThat(onTheWay.path("phone").asString()).isEqualTo("+251911456789");

		// switched-off riders can't be picked
		assertThat(patch("/api/admin/riders/" + riderId, Map.of("active", false), admin).status()).isEqualTo(200);
		assertThat(put("/api/admin/orders/" + orderNumber + "/parcels/1/rider", Map.of("riderId", riderId), admin).status())
				.isEqualTo(409);
	}
}
