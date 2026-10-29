package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The buyer's receipt after payment, delivery tracking with map points, and Admin → Demo data. */
class ReceiptTrackingIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0922113344";

	@Test
	void receiptAppearsOncePaidAndTrackingFollowsEachStepWithMapPoints() {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("500.00"), 5);
		String area = unique("Hill");
		long areaId = 0;
		for (JsonNode a : post("/api/admin/areas", Map.of("name", area), admin).body()) {
			if (a.path("name").asString().equals(area)) {
				areaId = a.path("id").asLong();
			}
		}
		Res point = put("/api/admin/areas/" + areaId + "/point", Map.of("lat", 6.8401, "lng", 37.7602), admin);
		assertThat(point.status()).as(point.raw()).isEqualTo(200);
		assertThat(put("/api/admin/areas/" + areaId + "/point", Map.of("lat", 6.84), admin).text("code")).isEqualTo("POINT_INCOMPLETE");

		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res checkout = post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", productId, "quantity", 2)),
				"customer", Map.of("name", "Receipt Buyer", "phone", PHONE, "email", "receipt@it.test"),
				"delivery", Map.of("address", "Behind the church", "city", "Wolaita Sodo", "notes", "", "area", area)));
		assertThat(checkout.status()).as(checkout.raw()).isEqualTo(200);
		String order = checkout.text("orderNumber");

		// no receipt before payment; strangers get "not found"
		assertThat(get("/api/orders/" + order + "/receipt?phone=" + PHONE).text("code")).isEqualTo("NOT_PAID");
		assertThat(get("/api/orders/" + order + "/receipt?phone=0900000000").status()).isEqualTo(404);
		assertThat(get("/api/orders/" + order + "/tracking?phone=0900000000").status()).isEqualTo(404);

		BigDecimal total = get("/api/orders/" + order + "/status?phone=" + PHONE).body().path("total").decimalValue();
		sendWebhook(BillPayFake.capturedWebhook(paymentId, order + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
				get("/api/orders/" + order + "/status?phone=" + PHONE).body().path("status").asString()).isEqualTo("PAID"));

		JsonNode receipt = get("/api/orders/" + order + "/receipt?phone=" + PHONE).body();
		assertThat(receipt.path("receiptNumber").asString()).isEqualTo("R-" + order);
		assertThat(receipt.path("total").decimalValue()).isEqualByComparingTo(total);
		assertThat(receipt.path("billpayPaymentId").asString()).isEqualTo(paymentId);
		assertThat(receipt.path("paymentMethod").asString()).isEqualTo("BILLPAY");
		assertThat(receipt.path("lines").get(0).path("quantity").asInt()).isEqualTo(2);
		assertThat(receipt.path("paidAt").isNull()).isFalse();
		// the printed receipt hides the middle of the phone number
		assertThat(receipt.path("customerPhone").asString()).contains("*").endsWith("344").doesNotContain("922113");

		JsonNode parcel = get("/api/orders/" + order + "/tracking?phone=" + PHONE).body().path("parcels").get(0);
		assertThat(parcel.path("to").path("label").asString()).isEqualTo(area);
		assertThat(parcel.path("to").path("exact").asBoolean()).isTrue();
		assertThat(parcel.path("to").path("lat").decimalValue()).isEqualByComparingTo("6.840100");
		assertThat(reached(parcel)).containsExactly("ORDERED", "PAID");

		Res rider = post("/api/admin/riders", Map.of("name", "Track Rider", "phone", "0911 222 333"), admin);
		put("/api/admin/orders/" + order + "/parcels/1/rider", Map.of("riderId", rider.body().path("id").asLong()), admin);
		post("/api/admin/orders/" + order + "/fulfilment", Map.of("status", "PROCESSING"), admin);
		post("/api/admin/orders/" + order + "/fulfilment", Map.of("status", "SHIPPED", "note", "Blue bajaj"), admin);
		parcel = get("/api/orders/" + order + "/tracking?phone=" + PHONE).body().path("parcels").get(0);
		assertThat(reached(parcel)).containsExactly("ORDERED", "PAID", "PACKING", "RIDER_ASSIGNED", "ON_THE_WAY");
		assertThat(parcel.path("riderName").asString()).isEqualTo("Track Rider");
		assertThat(parcel.path("riderPhone").asString()).isEqualTo("+251911222333");
		assertThat(parcel.path("trackingNote").asString()).isEqualTo("Blue bajaj");

		post("/api/admin/orders/" + order + "/fulfilment", Map.of("status", "DELIVERED"), admin);
		parcel = get("/api/orders/" + order + "/tracking?phone=" + PHONE).body().path("parcels").get(0);
		assertThat(reached(parcel)).contains("DELIVERED");
		// the rider's phone is only shown while the parcel is on the way
		assertThat(parcel.path("riderPhone").isNull()).isTrue();
	}

	private static List<String> reached(JsonNode parcel) {
		List<String> keys = new ArrayList<>();
		parcel.path("steps").forEach(s -> {
			if (!s.path("at").isNull()) {
				keys.add(s.path("key").asString());
			}
		});
		return keys;
	}

	@Test
	void demoDataLoadsOnceAndRemovesCleanly() {
		String admin = adminToken();
		JsonNode before = get("/api/admin/demo-data", admin).body();
		assertThat(before.path("listingsInFile").asInt()).isGreaterThan(150);

		JsonNode first = post("/api/admin/demo-data", Map.of(), admin).body();
		assertThat(first.path("listingsAdded").asInt()).isEqualTo(before.path("listingsInFile").asInt() - before.path("listingsLoaded").asInt());
		assertThat(post("/api/admin/demo-data", Map.of(), admin).body().path("listingsAdded").asInt()).isZero();

		JsonNode laptop = get("/api/products/demo-macbook-air-m2").body();
		assertThat(laptop.path("imageUrl").asString()).isEqualTo("/demo/demo-macbook-air-m2.jpg");
		assertThat(laptop.path("seller").path("name").asString()).isEqualTo("Sodo Tech Hub");
		assertThat(laptop.toString()).contains("Apple M2");
		assertThat(get("/api/products/demo-zigba-queen-bed").status()).isEqualTo(200);

		// support staff can look, only admins change it
		assertThat(post("/api/admin/demo-data", Map.of(), shopperToken()).status()).isIn(401, 403);

		JsonNode removed = delete("/api/admin/demo-data", admin).body();
		assertThat(removed.path("listingsDeleted").asInt() + removed.path("listingsHidden").asInt()).isGreaterThan(150);
		assertThat(get("/api/products/demo-macbook-air-m2").status()).isEqualTo(404);
		assertThat(get("/api/admin/demo-data", admin).body().path("listingsVisible").asInt()).isZero();
	}
}
