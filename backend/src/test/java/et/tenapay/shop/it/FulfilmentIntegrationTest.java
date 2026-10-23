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

/** Delivery fee, delivery details, fulfilment steps, cancelling and the address book. */
class FulfilmentIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0922334455";
	private static final BigDecimal PRICE = new BigDecimal("1450.00");

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, PRICE, 10);
	}

	private String placeOrder(int qty, String paymentId) {
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res r = post("/api/checkout", checkoutBody(productId, qty, PHONE));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("orderNumber");
	}

	private JsonNode status(String orderNumber) {
		return get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).body();
	}

	private String paidOrder() {
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = placeOrder(1, paymentId);
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("1600.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(status(orderNumber).path("status").asString())
				.isEqualTo("PAID"));
		return orderNumber;
	}

	private Res fulfil(String orderNumber, String to, String note, String token) {
		return post("/api/admin/orders/" + orderNumber + "/fulfilment",
				note == null ? Map.of("status", to) : Map.of("status", to, "note", note), token);
	}

	@Test
	void deliveryFeeIsAddedBelowTheThresholdAndChargedThroughBillPay() {
		JsonNode quote = get("/api/delivery").body();
		assertThat(quote.path("flatFee").decimalValue()).isEqualByComparingTo("150");
		assertThat(quote.path("freeOver").decimalValue()).isEqualByComparingTo("3000");

		String small = placeOrder(1, UUID.randomUUID().toString());
		JsonNode s = status(small);
		assertThat(s.path("subtotal").decimalValue()).isEqualByComparingTo("1450");
		assertThat(s.path("deliveryFee").decimalValue()).isEqualByComparingTo("150");
		assertThat(s.path("total").decimalValue()).isEqualByComparingTo("1600");
		assertThat(s.path("delivery").path("city").asString()).isEqualTo("Addis Ababa");
		assertThat(s.path("delivery").path("address").asString()).contains("Bole");
		var sent = billPay.getAllServeEvents().getFirst().getRequest().getBodyAsString();
		assertThat(json.readTree(sent).path("amount").decimalValue()).isEqualByComparingTo("1600");

		String big = placeOrder(3, UUID.randomUUID().toString());
		assertThat(status(big).path("deliveryFee").decimalValue()).isEqualByComparingTo("0");
		assertThat(status(big).path("total").decimalValue()).isEqualByComparingTo("4350");
	}

	@Test
	void checkoutNeedsADeliveryAddress() {
		Res r = post("/api/checkout", Map.of("items", List.of(Map.of("productId", productId, "quantity", 1)),
				"customer", Map.of("name", "No Address", "phone", PHONE, "email", "n@it.test")));
		assertThat(r.status()).isEqualTo(400);
		assertThat(r.text("code")).isEqualTo("VALIDATION_FAILED");
		assertThat(r.body().path("errors").has("delivery")).isTrue();
	}

	@Test
	void paidOrderGoesProcessingShippedDelivered_andCustomerSeesIt() {
		String orderNumber = paidOrder();
		assertThat(status(orderNumber).path("delivery").path("fulfilmentStatus").asString()).isEqualTo("UNFULFILLED");
		assertThat(status(orderNumber).path("canCancel").asBoolean()).isFalse();

		assertThat(fulfil(orderNumber, "PROCESSING", null, admin).status()).isEqualTo(200);
		Res shipped = fulfil(orderNumber, "SHIPPED", "Rider Dawit, 0911 000 111", admin);
		assertThat(shipped.status()).as(shipped.raw()).isEqualTo(200);

		JsonNode s = status(orderNumber);
		assertThat(s.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(s.path("delivery").path("trackingNote").asString()).contains("Rider Dawit");
		assertThat(s.path("timeline").findValuesAsString("type"))
				.containsSubsequence("ORDER_CREATED", "PAID", "FULFILMENT_PROCESSING", "FULFILMENT_SHIPPED");

		// can't go back or skip to nonsense
		Res back = fulfil(orderNumber, "PROCESSING", null, admin);
		assertThat(back.status()).isEqualTo(409);
		assertThat(back.text("code")).isEqualTo("INVALID_FULFILMENT_STEP");
		assertThat(fulfil(orderNumber, "CANCELLED", null, admin).status()).isEqualTo(409);

		assertThat(fulfil(orderNumber, "DELIVERED", null, admin).status()).isEqualTo(200);
		assertThat(status(orderNumber).path("delivery").path("deliveredAt").isNull()).isFalse();

		JsonNode detail = get("/api/admin/orders/" + orderNumber, admin).body();
		assertThat(detail.path("delivery").path("fulfilmentStatus").asString()).isEqualTo("DELIVERED");
		assertThat(detail.path("delivery").path("nextSteps")).isEmpty();
		JsonNode shippedList = get("/api/admin/orders?fulfilment=DELIVERED&q=" + orderNumber, admin).body();
		assertThat(shippedList.path("content").get(0).path("orderNumber").asString()).isEqualTo(orderNumber);
	}

	@Test
	void unpaidOrdersCantBeFulfilled_andSupportCantChangeDelivery() {
		String unpaid = placeOrder(1, UUID.randomUUID().toString());
		Res r = fulfil(unpaid, "PROCESSING", null, admin);
		assertThat(r.status()).isEqualTo(409);
		assertThat(r.text("code")).isEqualTo("ORDER_NOT_PAID");

		String paid = paidOrder();
		String supportEmail = unique("ship").toLowerCase() + "@it.test";
		post("/api/admin/users", Map.of("email", supportEmail, "fullName", "Support", "role", "SUPPORT",
				"password", "Str0ng-pass"), admin);
		String support = login("/api/admin/auth/login", supportEmail, "Str0ng-pass");
		assertThat(fulfil(paid, "PROCESSING", null, support).status()).isEqualTo(403);
		assertThat(get("/api/admin/orders/" + paid, support).status()).isEqualTo(200);
	}

	@Test
	void customerCancelsUnpaidOrder_stockReturns_andItCantBePaid() {
		String orderNumber = placeOrder(2, UUID.randomUUID().toString());
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).isEqualTo(2);
		assertThat(status(orderNumber).path("canCancel").asBoolean()).isTrue();

		// wrong phone: looks like the order doesn't exist
		assertThat(post("/api/orders/" + orderNumber + "/cancel", Map.of("phone", "0900000000")).status()).isEqualTo(404);

		Res cancel = post("/api/orders/" + orderNumber + "/cancel", Map.of("phone", PHONE, "reason", "Changed my mind"));
		assertThat(cancel.status()).as(cancel.raw()).isEqualTo(200);
		assertThat(cancel.text("status")).isEqualTo("CANCELLED");
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).isZero();

		assertThat(post("/api/orders/" + orderNumber + "/pay", Map.of("phone", PHONE)).status()).isEqualTo(409);
		Res again = post("/api/orders/" + orderNumber + "/cancel", Map.of("phone", PHONE));
		assertThat(again.status()).isEqualTo(409);
		assertThat(again.text("code")).isEqualTo("ORDER_NOT_CANCELLABLE");
	}

	@Test
	void paymentArrivingAfterCancelNeedsReview() {
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = placeOrder(1, paymentId);
		assertThat(post("/api/admin/orders/" + orderNumber + "/cancel", Map.of("reason", "Out of area"), admin).status())
				.isEqualTo(200);

		// the shopper still had BillPay open and paid
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("1600.00")));

		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(status(orderNumber).path("status").asString())
				.isEqualTo("REVIEW_REQUIRED"));
		assertThat(adminProduct(productId, admin).path("stock").asInt()).isEqualTo(10);
	}

	@Test
	void signedInCustomerKeepsAnAddressBook() {
		String email = unique("addr").toLowerCase() + "@it.test";
		String token = post("/api/auth/register", Map.of("fullName", "Address Owner", "email", email,
				"password", "Str0ng-pass")).body().path("token").asString();

		Res added = post("/api/me/addresses", Map.of("label", "Office", "recipientName", "Address Owner",
				"phone", "0911223344", "addressLine", "Kazanchis, Nega City Mall 3rd floor", "city", "Addis Ababa"), token);
		assertThat(added.status()).as(added.raw()).isEqualTo(200);
		assertThat(added.body()).hasSize(1);
		assertThat(added.body().get(0).path("isDefault").asBoolean()).isTrue();
		assertThat(added.body().get(0).path("phone").asString()).isEqualTo("+251911223344");

		// checkout with "save this address" adds the new one, not a duplicate of the old one
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		var body = new java.util.HashMap<>(checkoutBody(productId, 1, PHONE));
		body.put("saveAddress", true);
		assertThat(post("/api/checkout", body, token).status()).isEqualTo(200);
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString()); // BillPay gives every payment its own id
		assertThat(post("/api/checkout", body, token).status()).isEqualTo(200);
		JsonNode list = get("/api/me/addresses", token).body();
		assertThat(list).hasSize(2);
		assertThat(list.findValuesAsString("addressLine")).contains("Bole, Atlas area, house 12");

		long officeId = list.get(0).path("id").asLong();
		JsonNode afterDelete = delete("/api/me/addresses/" + officeId, token).body();
		assertThat(afterDelete).hasSize(1);
		assertThat(afterDelete.get(0).path("isDefault").asBoolean()).isTrue();

		assertThat(get("/api/me/addresses").status()).isEqualTo(401);
		assertThat(get("/api/me/addresses", admin).status()).isEqualTo(403);
	}
}
