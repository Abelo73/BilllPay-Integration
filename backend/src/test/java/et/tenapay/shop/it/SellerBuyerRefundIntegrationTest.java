package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * Refunds without waiting for staff: the buyer cancels a paid parcel before packing starts, the seller cancels one it
 * can't send, staff cancelling a paid parcel now really refunds it, and the seller settles a problem (refund in full,
 * * or an offer the buyer accepts or declines). A refund BillPay refuses stays owed and waits for staff.
 */
class SellerBuyerRefundIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Refund Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
		BillPayFake.acceptsRefunds(billPay);
	}

	private record Seller(String token, long productId) {
	}

	private Seller seller() {
		String token = post("/api/auth/register", Map.of("fullName", "Refund Seller", "email", unique("rf") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Refund Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Refund item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("1000.00"));
		req.put("stock", 20);
		req.put("active", true);
		return new Seller(token, post("/api/seller/products", req, token).body().path("product").path("id").asLong());
	}

	private String buyAndPay(long productId) {
		String buyer = shopperToken();
		Res r = post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", productId, "quantity", 1)),
				"customer", Map.of("name", "Hana Girma", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "University area", "city", "Wolaita Sodo")), buyer);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String n = r.text("orderNumber");
		BigDecimal total = get("/api/orders/" + n + "/status", buyer).body().path("total").decimalValue();
		sendWebhook(BillPayFake.capturedWebhook("pay-" + n + "-A1", n + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).until(() -> "PAID".equals(get("/api/orders/" + n + "/status", buyer).text("status")));
		return n;
	}

	private BigDecimal held(Seller s) {
		return get("/api/seller/money", s.token()).body().path("balance").path("held").decimalValue();
	}

	private int stock(long productId) {
		return adminProduct(productId, admin).path("stock").asInt();
	}

	@Test
	void buyerCancelsBeforePacking_getsRefund_andItemGoesBackOnSale() {
		Seller s = seller();
		String n = buyAndPay(s.productId());
		String buyer = shopperToken();
		assertThat(stock(s.productId())).isEqualTo(19);
		assertThat(held(s)).isEqualByComparingTo("1150.00");

		assertThat(post("/api/orders/" + n + "/parcels/1/cancel", Map.of(), s.token()).status()).as("not the buyer").isEqualTo(404);
		JsonNode r = post("/api/orders/" + n + "/parcels/1/cancel", Map.of("reason", "Ordered by mistake"), buyer).body();
		assertThat(r.path("refunded").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(get("/api/admin/refunds", admin).raw()).contains(n);
		assertThat(held(s)).isEqualByComparingTo("0");
		assertThat(stock(s.productId())).as("back on sale").isEqualTo(20);
		assertThat(post("/api/orders/" + n + "/parcels/1/cancel", Map.of(), buyer).text("code")).isEqualTo("ALREADY_CANCELLED");
	}

	@Test
	void buyerCantCancelOncePackingStarted_butSellerCan() {
		Seller s = seller();
		String n = buyAndPay(s.productId());
		String buyer = shopperToken();
		post("/api/seller/orders/" + n + "/fulfilment", Map.of("status", "PROCESSING"), s.token());
		assertThat(post("/api/orders/" + n + "/parcels/1/cancel", Map.of(), buyer).text("code")).isEqualTo("SELLER_STARTED");

		assertThat(post("/api/seller/orders/" + n + "/cancel", Map.of(), s.token()).text("code")).isEqualTo("REASON_REQUIRED");
		JsonNode r = post("/api/seller/orders/" + n + "/cancel", Map.of("reason", "Sold out in the shop"), s.token()).body();
		assertThat(r.path("refunded").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(held(s)).isEqualByComparingTo("0");
	}

	@Test
	void whenBillPayRefusesTheRefund_theCancelGoesAhead_andTheRefundWaitsForStaff() {
		Seller s = seller();
		String n = buyAndPay(s.productId());
		BillPayFake.refundsRefused(billPay, "pay-" + n + "-A1");
		JsonNode r = post("/api/orders/" + n + "/parcels/1/cancel", Map.of(), shopperToken()).body();
		assertThat(r.path("refunded").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(r.path("refundStatus").asString()).isEqualTo("NEEDS_STAFF");
		assertThat(held(s)).as("the seller won't get it").isEqualByComparingTo("0");
		assertThat(stock(s.productId())).as("back on sale").isEqualTo(20);
		assertThat(get("/api/admin/refunds/needs-staff", admin).raw()).contains(n).contains("NEEDS_STAFF");
	}

	@Test
	void staffCancellingAPaidParcelNowRefundsIt() {
		Seller s = seller();
		String n = buyAndPay(s.productId());
		assertThat(post("/api/admin/orders/" + n + "/parcels/1/fulfilment", Map.of("status", "CANCELLED"), admin).text("code"))
				.isEqualTo("REASON_REQUIRED");
		JsonNode r = post("/api/admin/orders/" + n + "/parcels/1/fulfilment",
				Map.of("status", "CANCELLED", "note", "Seller closed the shop"), admin).body();
		assertThat(r.path("refunded").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(get("/api/admin/refunds", admin).raw()).contains(n);
	}

	@Test
	void sellerSettlesProblems_fullRefund_offerAccepted_offerDeclined() {
		Seller s = seller();
		String buyer = shopperToken();

		// 1. the seller refunds in full straight away
		String a = buyAndPay(s.productId());
		long d1 = post("/api/orders/" + a + "/parcels/1/disputes", Map.of("reason", "NOT_RECEIVED", "details", "Nothing came after a week."), buyer)
				.body().path("id").asLong();
		assertThat(get("/api/disputes/" + d1, s.token()).body().path("canRefund").asBoolean()).isTrue();
		assertThat(post("/api/seller/disputes/" + d1 + "/refund", Map.of(), buyer).status()).as("buyer can't use the seller's button").isNotEqualTo(200);
		JsonNode full = post("/api/seller/disputes/" + d1 + "/refund", Map.of("note", "Sorry, it got lost."), s.token()).body();
		assertThat(full.path("status").asString()).isEqualTo("REFUNDED");
		assertThat(full.path("refundAmount").decimalValue()).isEqualByComparingTo("1150.00");

		// 2. the seller offers part back; the buyer accepts
		String b = buyAndPay(s.productId());
		long d2 = post("/api/orders/" + b + "/parcels/1/disputes", Map.of("reason", "DAMAGED", "details", "The corner is scratched."), buyer)
				.body().path("id").asLong();
		assertThat(post("/api/seller/disputes/" + d2 + "/refund", Map.of("amount", 5000), s.token()).text("code")).isEqualTo("AMOUNT_INVALID");
		JsonNode offered = post("/api/seller/disputes/" + d2 + "/refund", Map.of("amount", 200, "note", "For the scratch."), s.token()).body();
		assertThat(offered.path("status").asString()).isEqualTo("OPEN");
		assertThat(offered.path("sellerOffer").decimalValue()).isEqualByComparingTo("200.00");
		assertThat(get("/api/disputes/" + d2, buyer).body().path("canAnswerOffer").asBoolean()).isTrue();
		JsonNode accepted = post("/api/disputes/" + d2 + "/offer/accept", Map.of(), buyer).body();
		assertThat(accepted.path("status").asString()).isEqualTo("PART_REFUNDED");
		assertThat(accepted.path("refundAmount").decimalValue()).isEqualByComparingTo("200.00");

		// 3. an offer the buyer declines stays open for staff
		String c = buyAndPay(s.productId());
		long d3 = post("/api/orders/" + c + "/parcels/1/disputes", Map.of("reason", "WRONG_ITEM", "details", "Got the blue one, not black."), buyer)
				.body().path("id").asLong();
		post("/api/seller/disputes/" + d3 + "/refund", Map.of("amount", 100), s.token());
		JsonNode declined = post("/api/disputes/" + d3 + "/offer/decline", Map.of(), buyer).body();
		assertThat(declined.path("status").asString()).isEqualTo("OPEN");
		assertThat(declined.path("sellerOffer").isNull()).isTrue();
		assertThat(post("/api/disputes/" + d3 + "/offer/accept", Map.of(), buyer).text("code")).isEqualTo("NO_OFFER");
		// and a parcel with an open problem can't be cancelled around it
		assertThat(post("/api/seller/orders/" + c + "/cancel", Map.of("reason", "x"), s.token()).text("code")).isEqualTo("PROBLEM_OPEN");
	}
}
