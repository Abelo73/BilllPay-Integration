package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import et.tenapay.shop.delivery.RiderShareService;
import tools.jackson.databind.JsonNode;

/**
 * Delivery tracking: the rider's personal link shares their location only while the parcel is on its way; the buyer
 * sees it on their own order; everything stops at delivery.
 */
class RiderShareIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0922334466";

	@Autowired
	RiderShareService riderShare;
	@Autowired
	JdbcTemplate jdbc;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("1450.00"), 10);
	}

	private String paidOrder() {
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res r = post("/api/checkout", checkoutBody(productId, 1, PHONE));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String orderNumber = r.text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("1600.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
				get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).body().path("status").asString()).isEqualTo("PAID"));
		return orderNumber;
	}

	private Res fulfil(String orderNumber, String to) {
		return post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", to), admin);
	}

	@Test
	void theLinkSharesOnlyWhileOnTheWayAndTheBuyerSeesIt() {
		String orderNumber = paidOrder();
		assertThat(fulfil(orderNumber, "PROCESSING").status()).isEqualTo(200);
		Res rider = post("/api/admin/riders", Map.of("name", "Dawit K.", "phone", "0911456789"), admin);
		long riderId = rider.body().path("id").asLong();
		assertThat(put("/api/admin/orders/" + orderNumber + "/parcels/1/rider", Map.of("riderId", riderId), admin).status()).isEqualTo(200);
		long parcelId = jdbc.queryForObject("select p.id from order_parcels p join orders o on o.id = p.order_id where o.order_number = ? and p.parcel_no = 1",
				Long.class, orderNumber);

		// the link the rider was sent by SMS (here the test takes the secret directly)
		String secret = riderShare.createLink(parcelId, riderId);

		// not on the way yet: the point is refused and the page says so
		assertThat(post("/api/rider/share/" + secret + "/location", Map.of("latitude", 6.86, "longitude", 37.75), null).status()).isEqualTo(410);
		assertThat(get("/api/rider/share/" + secret).body().path("onTheWay").asBoolean()).isFalse();

		// the parcel leaves: the rider shares a walking point
		assertThat(fulfil(orderNumber, "SHIPPED").status()).isEqualTo(200);
		assertThat(get("/api/rider/share/" + secret).body().path("onTheWay").asBoolean()).isTrue();
		assertThat(post("/api/rider/share/" + secret + "/location", Map.of("latitude", 6.86, "longitude", 37.75, "speed", 1.2), null).status()).isEqualTo(200);

		// the buyer, signed in, sees the rider on their order
		String buyer = shopperToken();
		JsonNode seen = get("/api/orders/" + orderNumber + "/rider-location", buyer).body();
		assertThat(seen.size()).isEqualTo(1);
		assertThat(seen.get(0).path("travelMode").asString()).isEqualTo("WALK");

		// a fast point (a car) changes the mode shown
		assertThat(post("/api/rider/share/" + secret + "/location", Map.of("latitude", 6.87, "longitude", 37.76, "speed", 9.0), null).status()).isEqualTo(200);
		assertThat(get("/api/orders/" + orderNumber + "/rider-location", buyer).body().get(0).path("travelMode").asString()).isEqualTo("CAR");

		// someone else, or no one, sees nothing
		assertThat(get("/api/orders/" + orderNumber + "/rider-location").status()).isEqualTo(401);
		assertThat(get("/api/orders/" + orderNumber + "/rider-location", adminToken()).status()).isEqualTo(404);

		// delivered: sharing stops at once
		assertThat(fulfil(orderNumber, "DELIVERED").status()).isEqualTo(200);
		assertThat(post("/api/rider/share/" + secret + "/location", Map.of("latitude", 6.86, "longitude", 37.75), null).status()).isEqualTo(410);
		assertThat(get("/api/rider/share/" + secret).body().path("ended").asBoolean()).isTrue();
		assertThat(get("/api/orders/" + orderNumber + "/rider-location", buyer).body().size()).isZero();

		// a made-up link is refused
		assertThat(get("/api/rider/share/not-a-real-link").status()).isEqualTo(404);
	}
}
