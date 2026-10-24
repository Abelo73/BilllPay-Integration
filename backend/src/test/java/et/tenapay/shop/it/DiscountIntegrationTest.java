package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Discount codes: price maths, what BillPay is asked to charge, limits and holds. */
class DiscountIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0955667788";

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("1450.00"), 50);
	}

	private String createCode(Map<String, Object> fields) {
		String code = unique("SAVE").toUpperCase().replace("-", "");
		Map<String, Object> body = new LinkedHashMap<>(fields);
		body.put("code", code.toLowerCase()); // stored upper-case
		Res r = post("/api/admin/discounts", body, admin);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return code;
	}

	private JsonNode codeRow(String code) {
		for (JsonNode row : get("/api/admin/discounts", admin).body()) {
			if (row.path("code").asString().equals(code)) {
				return row;
			}
		}
		throw new AssertionError("code not listed: " + code);
	}

	private Res checkout(int qty, String code) {
		Map<String, Object> body = new HashMap<>(checkoutBody(productId, qty, PHONE));
		body.put("discountCode", code);
		return post("/api/checkout", body);
	}

	private Res check(int qty, String code) {
		return post("/api/discounts/check", Map.of("items", List.of(Map.of("productId", productId, "quantity", qty)),
				"code", code));
	}

	@Test
	void percentCodeLowersWhatBillPayCharges_andThePaymentStillMatches() {
		String code = createCode(Map.of("kind", "PERCENT", "value", "10", "maxDiscount", "500", "description", "10% off"));

		// 2 × 1450 = 2900, -10% = 2610, under 3000 so delivery 150 → 2760
		JsonNode quote = check(2, code.toLowerCase()).body();
		assertThat(quote.path("discount").decimalValue()).isEqualByComparingTo("290");
		assertThat(quote.path("deliveryFee").decimalValue()).isEqualByComparingTo("150");
		assertThat(quote.path("total").decimalValue()).isEqualByComparingTo("2760");
		assertThat(codeRow(code).path("timesUsed").asInt()).as("checking doesn't use it").isZero();

		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res order = checkout(2, " " + code.toLowerCase() + " ");
		assertThat(order.status()).as(order.raw()).isEqualTo(200);
		String orderNumber = order.text("orderNumber");
		String sent = billPay.findAll(postRequestedFor(urlEqualTo(BillPayFake.CREATE_PATH))).getFirst().getBodyAsString();
		assertThat(json.readTree(sent).path("amount").decimalValue()).isEqualByComparingTo("2760");

		JsonNode view = get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).body();
		assertThat(view.path("discountCode").asString()).isEqualTo(code);
		assertThat(view.path("discountAmount").decimalValue()).isEqualByComparingTo("290");
		assertThat(view.path("total").decimalValue()).isEqualByComparingTo("2760");

		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("2760.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
				get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).text("status")).isEqualTo("PAID"));

		JsonNode row = codeRow(code);
		assertThat(row.path("timesUsed").asInt()).isEqualTo(1);
		assertThat(row.path("paidOrders").asLong()).isEqualTo(1);
		assertThat(row.path("discountGiven").decimalValue()).isEqualByComparingTo("290");
	}

	@Test
	void percentCapAndFixedCodesNeverGoBelowZero() {
		String capped = createCode(Map.of("kind", "PERCENT", "value", "50", "maxDiscount", "200"));
		assertThat(check(2, capped).body().path("discount").decimalValue()).isEqualByComparingTo("200");

		// fixed 5000 on a 1450 cart: the items become free, delivery is still charged
		String big = createCode(Map.of("kind", "FIXED", "value", "5000"));
		JsonNode q = check(1, big).body();
		assertThat(q.path("discount").decimalValue()).isEqualByComparingTo("1450");
		assertThat(q.path("total").decimalValue()).isEqualByComparingTo("150");
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		assertThat(checkout(1, big).status()).isEqualTo(200);
	}

	@Test
	void freeDeliveryIsJudgedAfterTheDiscount() {
		String code = createCode(Map.of("kind", "PERCENT", "value", "10"));
		// 3 × 1450 = 4350 → 3915 after 10%: still over 3000, delivery free
		assertThat(check(3, code).body().path("deliveryFee").decimalValue()).isEqualByComparingTo("0");
		// 3200 worth? use a fixed code that drops 4350 under 3000
		String fixed = createCode(Map.of("kind", "FIXED", "value", "1500"));
		JsonNode q = check(3, fixed).body();
		assertThat(q.path("deliveryFee").decimalValue()).isEqualByComparingTo("150");
		assertThat(q.path("total").decimalValue()).isEqualByComparingTo("3000");
	}

	@Test
	void limitedCodeIsHeldByUnpaidOrders_andReleasedOnCancel() {
		String code = createCode(Map.of("kind", "FIXED", "value", "100", "usageLimit", 1));

		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		String first = checkout(1, code).text("orderNumber");
		assertThat(codeRow(code).path("timesUsed").asInt()).isEqualTo(1);

		Res second = checkout(1, code);
		assertThat(second.status()).isEqualTo(400);
		assertThat(second.text("code")).isEqualTo("DISCOUNT_INVALID");
		assertThat(second.body().path("reason").asString()).isEqualTo("USED_UP");
		assertThat(adminProduct(productId, admin).path("reserved").asInt()).as("refused checkout reserves nothing").isEqualTo(1);

		assertThat(post("/api/orders/" + first + "/cancel", Map.of("phone", PHONE)).status()).isEqualTo(200);
		assertThat(codeRow(code).path("timesUsed").asInt()).isZero();

		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		assertThat(checkout(1, code).status()).isEqualTo(200);
	}

	@Test
	void invalidCodesExplainWhy() {
		assertThat(check(1, "NO-SUCH-CODE").body().path("reason").asString()).isEqualTo("UNKNOWN");

		String expired = createCode(Map.of("kind", "FIXED", "value", "50",
				"startsAt", Instant.now().minusSeconds(7200).toString(), "expiresAt", Instant.now().minusSeconds(60).toString()));
		assertThat(check(1, expired).body().path("reason").asString()).isEqualTo("EXPIRED");

		String future = createCode(Map.of("kind", "FIXED", "value", "50", "startsAt", Instant.now().plusSeconds(3600).toString()));
		assertThat(check(1, future).body().path("reason").asString()).isEqualTo("NOT_STARTED");

		String minimum = createCode(Map.of("kind", "FIXED", "value", "50", "minSubtotal", "5000"));
		Res below = check(1, minimum);
		assertThat(below.body().path("reason").asString()).isEqualTo("BELOW_MINIMUM");
		assertThat(below.text("detail")).contains("5000");

		String off = createCode(Map.of("kind", "FIXED", "value", "50"));
		long id = codeRow(off).path("id").asLong();
		assertThat(patch("/api/admin/discounts/" + id, Map.of("active", false), admin).status()).isEqualTo(200);
		assertThat(check(1, off).body().path("reason").asString()).isEqualTo("INACTIVE");
		assertThat(codeRow(off).path("state").asString()).isEqualTo("INACTIVE");

		Res noCode = checkout(1, "NO-SUCH-CODE");
		assertThat(noCode.status()).isEqualTo(400);
	}

	@Test
	void adminRulesForCodes() {
		String code = createCode(Map.of("kind", "PERCENT", "value", "5"));
		Res dup = post("/api/admin/discounts", Map.of("code", code, "kind", "FIXED", "value", "1"), admin);
		assertThat(dup.status()).isEqualTo(409);
		assertThat(post("/api/admin/discounts", Map.of("code", "OVER100", "kind", "PERCENT", "value", "150"), admin).status())
				.isEqualTo(400);
		assertThat(post("/api/admin/discounts", Map.of("code", "bad code!", "kind", "FIXED", "value", "1"), admin).status())
				.isEqualTo(400);

		String supportEmail = unique("disc").toLowerCase() + "@it.test";
		post("/api/admin/users", Map.of("email", supportEmail, "fullName", "Support", "role", "SUPPORT",
				"password", "Str0ng-pass"), admin);
		String support = login("/api/admin/auth/login", supportEmail, "Str0ng-pass");
		assertThat(get("/api/admin/discounts", support).status()).isEqualTo(200);
		assertThat(post("/api/admin/discounts", Map.of("code", "SUPPORTX", "kind", "FIXED", "value", "1"), support).status())
				.isEqualTo(403);
		assertThat(get("/api/admin/discounts").status()).isEqualTo(401);
	}
}
