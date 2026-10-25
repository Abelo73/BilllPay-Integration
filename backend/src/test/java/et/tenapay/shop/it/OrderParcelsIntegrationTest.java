package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * Sodo Gebeya M5: one checkout, one parcel per seller. The buyer pays once; each seller (and Sodo Gebeya for its own
 * items) delivers their parcel with its own delivery fee and steps; the order follows its parcels.
 */
class OrderParcelsIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("M5 Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
	}

	private record Seller(String token, long productId) {
	}

	private Seller seller(String name, String price) {
		Res reg = post("/api/auth/register", Map.of("fullName", name, "email", unique("m5") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026"));
		String token = reg.body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique(name), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique(name + " item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal(price));
		req.put("stock", 20);
		req.put("active", true);
		Res p = post("/api/seller/products", req, token);
		assertThat(p.status()).as(p.raw()).isEqualTo(200);
		return new Seller(token, p.body().path("product").path("id").asLong());
	}

	private static Map<String, Object> cart(List<Long> ids, String code) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("items", ids.stream().map(id -> Map.of("productId", id, "quantity", 1)).toList());
		body.put("customer", Map.of("name", "Hana Girma", "phone", "0911223344", "email", "buyer@it.test"));
		body.put("delivery", Map.of("address", "University area, block 4", "city", "Wolaita Sodo"));
		if (code != null) {
			body.put("discountCode", code);
			body.put("code", code);
		}
		return body;
	}

	private String pay(String orderNumber) {
		BigDecimal total = get("/api/orders/" + orderNumber + "/status", shopperToken()).body().path("total").decimalValue();
		sendWebhook(BillPayFake.capturedWebhook("pay-" + orderNumber + "-A1", orderNumber + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).until(() ->
				"PAID".equals(get("/api/orders/" + orderNumber + "/status", shopperToken()).text("status")));
		return orderNumber;
	}

	private JsonNode status(String orderNumber) {
		return get("/api/orders/" + orderNumber + "/status", shopperToken()).body();
	}

	private Res sellerStep(Seller s, String orderNumber, String to) {
		return post("/api/seller/orders/" + orderNumber + "/fulfilment", Map.of("status", to), s.token());
	}

	@Test
	void oneCheckoutThreeParcels_eachDeliveredOnItsOwn() {
		long house = createProduct(admin, new BigDecimal("1000.00"), 20);
		Seller a = seller("Marta Boutique", "2000.00");
		Seller b = seller("Dawit Electronics", "3500.00");
		List<Long> ids = List.of(b.productId(), house, a.productId());

		// the quote shows one parcel per seller, Sodo Gebeya's first; free delivery is per parcel (3,000+)
		JsonNode q = post("/api/checkout/quote", Map.of("items", ids.stream().map(id -> Map.of("productId", id, "quantity", 1)).toList()))
				.body();
		assertThat(q.path("parcels").size()).isEqualTo(3);
		assertThat(q.path("parcels").get(0).path("seller").isNull()).isTrue();
		assertThat(q.path("deliveryFee").decimalValue()).isEqualByComparingTo("300.00");
		assertThat(q.path("total").decimalValue()).isEqualByComparingTo("6800.00");

		Res placed = post("/api/checkout", cart(ids, null));
		assertThat(placed.status()).as(placed.raw()).isEqualTo(200);
		String n = pay(placed.text("orderNumber"));
		JsonNode st = status(n);
		assertThat(st.path("total").decimalValue()).isEqualByComparingTo("6800.00");
		assertThat(st.path("parcels").size()).isEqualTo(3);
		assertThat(strings(st.path("parcels"), "fulfilmentStatus")).containsOnly("UNFULFILLED");
		assertThat(strings(st.path("parcels"), "number")).containsExactly(n + "-1", n + "-2", n + "-3");
		for (JsonNode item : st.path("items")) {
			assertThat(item.path("parcelNo").asInt()).isBetween(1, 3);
		}

		// seller A sends theirs: the buyer sees that parcel on the way, the order waits for the rest
		assertThat(sellerStep(a, n, "SHIPPED").status()).isEqualTo(200);
		st = status(n);
		assertThat(st.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("UNFULFILLED");
		assertThat(parcelOf(st, "Marta").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(parcelOf(st, "Dawit").path("fulfilmentStatus").asString()).isEqualTo("UNFULFILLED");

		// staff deliver Sodo Gebeya's own parcel; they see all parcels on the order page
		JsonNode detail = get("/api/admin/orders/" + n, admin).body();
		assertThat(detail.path("parcels").size()).isEqualTo(3);
		assertThat(detail.path("parcels").get(0).path("seller").asString()).isEqualTo("Sodo Gebeya");
		assertThat(post("/api/admin/orders/" + n + "/parcels/1/fulfilment", Map.of("status", "SHIPPED"), admin).status())
				.isEqualTo(200);
		assertThat(post("/api/admin/orders/" + n + "/parcels/1/fulfilment", Map.of("status", "DELIVERED"), admin).status())
				.isEqualTo(200);
		assertThat(sellerStep(b, n, "PROCESSING").status()).isEqualTo(200);
		assertThat(status(n).path("delivery").path("fulfilmentStatus").asString()).isEqualTo("PROCESSING");
		assertThat(sellerStep(b, n, "SHIPPED").status()).isEqualTo(200);
		assertThat(status(n).path("delivery").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(sellerStep(a, n, "DELIVERED").status()).isEqualTo(200);
		assertThat(sellerStep(b, n, "DELIVERED").status()).isEqualTo(200);
		st = status(n);
		assertThat(st.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("DELIVERED");
		assertThat(st.path("delivery").path("deliveredAt").isNull()).isFalse();
		assertThat(sellerStep(a, n, "DELIVERED").status()).isEqualTo(409); // nothing further
	}

	@Test
	void discountSpreadsOverParcels_andStaffCancelOnlyWhatHasntLeft() {
		long house = createProduct(admin, new BigDecimal("1000.00"), 20);
		Seller a = seller("Selam Shoes", "2000.00");
		Seller b = seller("Abebe Phones", "3500.00");
		String code = "PARCEL" + ThreadLocalRandom.current().nextInt(100000, 999999);
		assertThat(post("/api/admin/discounts", Map.of("code", code, "kind", "FIXED", "value", "650"), admin).status())
				.isEqualTo(200);

		List<Long> ids = List.of(house, a.productId(), b.productId());
		JsonNode q = post("/api/checkout/quote", cart(ids, code)).body();
		// 650 off 6,500 spread by value: 100 / 200 / 350, so the 3,500 parcel (3,150 after) still ships free
		assertThat(q.path("discount").decimalValue()).isEqualByComparingTo("650.00");
		assertThat(q.path("deliveryFee").decimalValue()).isEqualByComparingTo("300.00");
		assertThat(q.path("total").decimalValue()).isEqualByComparingTo("6150.00");

		String n = pay(post("/api/checkout", cart(ids, code)).text("orderNumber"));
		JsonNode parcels = get("/api/admin/orders/" + n, admin).body().path("parcels");
		assertThat(parcels.get(0).path("discountShare").decimalValue()).isEqualByComparingTo("100.00");
		assertThat(parcels.get(1).path("discountShare").decimalValue()).isEqualByComparingTo("200.00");
		assertThat(parcels.get(2).path("discountShare").decimalValue()).isEqualByComparingTo("350.00");
		assertThat(parcels.get(2).path("deliveryFee").decimalValue()).isEqualByComparingTo("0.00");

		// one parcel already left; cancelling the whole order (staff) stops only the others
		assertThat(sellerStep(a, n, "SHIPPED").status()).isEqualTo(200);
		assertThat(post("/api/admin/orders/" + n + "/fulfilment", Map.of("status", "CANCELLED", "note", "Buyer moved away"), admin)
				.status()).isEqualTo(200);
		JsonNode st = status(n);
		assertThat(parcelOf(st, "Selam").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(parcelOf(st, "Abebe").path("fulfilmentStatus").asString()).isEqualTo("CANCELLED");
		assertThat(st.path("parcels").get(0).path("fulfilmentStatus").asString()).isEqualTo("CANCELLED");
		assertThat(st.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");

		// a seller can't cancel, and never reaches another seller's parcel
		Res cancel = sellerStep(a, n, "CANCELLED");
		assertThat(cancel.status()).isEqualTo(403);
		assertThat(post("/api/admin/orders/" + n + "/parcels/2/fulfilment", Map.of("status", "DELIVERED"), b.token()).status())
				.isEqualTo(403);
	}

	@Test
	void singleSellerOrdersLookAsBefore() {
		long house = createProduct(admin, new BigDecimal("500.00"), 5);
		String n = pay(post("/api/checkout", cart(List.of(house), null)).text("orderNumber"));
		JsonNode st = status(n);
		assertThat(st.path("parcels").size()).isEqualTo(1);
		assertThat(st.path("deliveryFee").decimalValue()).isEqualByComparingTo("150.00");
		assertThat(post("/api/admin/orders/" + n + "/fulfilment", Map.of("status", "SHIPPED", "note", "Rider Abel"), admin)
				.status()).isEqualTo(200);
		st = status(n);
		assertThat(st.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(st.path("delivery").path("trackingNote").asString()).isEqualTo("Rider Abel");
		assertThat(st.path("parcels").get(0).path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
	}

	private static JsonNode parcelOf(JsonNode status, String sellerPrefix) {
		for (JsonNode p : status.path("parcels")) {
			if (p.path("seller").asString("").startsWith(sellerPrefix)) {
				return p;
			}
		}
		throw new AssertionError("no parcel from " + sellerPrefix + " in " + status.path("parcels"));
	}

	private static List<String> strings(JsonNode array, String field) {
		List<String> out = new java.util.ArrayList<>();
		array.forEach(n -> out.add(n.path(field).asString()));
		return out;
	}
}
