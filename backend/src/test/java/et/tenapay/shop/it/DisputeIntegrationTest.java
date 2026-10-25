package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** M8: a buyer reports a problem with a parcel; its money stays held; staff refund, part refund or pay the seller. */
class DisputeIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("M8 Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
		BillPayFake.acceptsRefunds(billPay);
	}

	private record Seller(String token, long productId) {
	}

	private Seller seller() {
		String token = post("/api/auth/register", Map.of("fullName", "Dispute Seller", "email", unique("m8") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Dispute Shop"), "phone", "0912345678"), token)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Dispute item"));
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

	private BigDecimal bal(Seller s, String field) {
		return get("/api/seller/money", s.token()).body().path("balance").path(field).decimalValue();
	}

	private static byte[] photo() throws Exception {
		BufferedImage img = new BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		return out.toByteArray();
	}

	@Test
	void problemKeepsMoneyHeld_thenPartRefund() throws Exception {
		Seller s = seller();
		String n = buyAndPay(s.productId());
		String buyer = shopperToken();
		post("/api/seller/orders/" + n + "/fulfilment", Map.of("status", "SHIPPED"), s.token());

		String path = "/api/orders/" + n + "/parcels/1/disputes";
		assertThat(post(path, Map.of("reason", "DAMAGED", "details", "bad"), buyer).text("code")).isEqualTo("DETAILS_REQUIRED");
		assertThat(post(path, Map.of("reason", "DAMAGED", "details", "The screen came cracked."), s.token()).status()).isEqualTo(404);
		JsonNode d = post(path, Map.of("reason", "DAMAGED", "details", "The screen came cracked in the box."), buyer).body();
		long id = d.path("id").asLong();
		assertThat(d.path("status").asString()).isEqualTo("OPEN");
		assertThat(d.path("parcelTotal").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(d.path("canWithdraw").asBoolean()).isTrue();
		assertThat(post(path, Map.of("reason", "OTHER", "details", "Another report about it"), buyer).text("code")).isEqualTo("ALREADY_OPEN");
		assertThat(get("/api/orders/" + n + "/disputes", buyer).body().get(0).path("id").asLong()).isEqualTo(id);
		await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
				assertThat(get("/api/admin/sms?q=912345678", admin).raw()).contains("reported a problem with order"));

		// a photo of the damage
		JsonNode withPhoto = upload("/api/disputes/" + id + "/photos", "crack.png", "image/png", photo(), buyer).body();
		long photoId = withPhoto.path("photoIds").get(0).asLong();

		// receipt confirmed, but the money stays held while the problem is open
		post("/api/orders/" + n + "/parcels/1/received", Map.of(), buyer);
		assertThat(bal(s, "held")).isEqualByComparingTo("1150.00");
		assertThat(bal(s, "available")).isEqualByComparingTo("0");

		// the seller sees it and answers; strangers can't
		assertThat(get("/api/seller/disputes", s.token()).body().get(0).path("id").asLong()).isEqualTo(id);
		JsonNode sellerView = post("/api/disputes/" + id + "/messages", Map.of("body", "It left us fine; we can swap the screen."), s.token()).body();
		assertThat(sellerView.path("viewer").asString()).isEqualTo("SELLER");
		assertThat(sellerView.path("sellerRepliedAt").isNull()).isFalse();
		assertThat(sellerView.path("canWithdraw").asBoolean()).isFalse();
		assertThat(getBytes("/api/disputes/" + id + "/photos/" + photoId).statusCode()).isEqualTo(401);
		Seller stranger = seller();
		assertThat(get("/api/disputes/" + id, stranger.token()).status()).isEqualTo(404);

		// staff settle: part refund
		assertThat(get("/api/admin/disputes", admin).body().path("content").toString()).contains("\"id\":" + id);
		assertThat(get("/api/admin/disputes/count", admin).body().path("open").asLong()).isGreaterThanOrEqualTo(1);
		JsonNode staffView = get("/api/admin/disputes/" + id, admin).body();
		assertThat(staffView.path("buyerPhone").asString()).isNotBlank();
		assertThat(staffView.path("messages").size()).isEqualTo(1);
		String decision = "/api/admin/disputes/" + id + "/decision";
		assertThat(post(decision, Map.of("outcome", "PART_REFUND", "amount", 2000, "note", "x"), admin).text("code")).isEqualTo("AMOUNT_INVALID");
		assertThat(post(decision, Map.of("outcome", "PART_REFUND", "amount", 300), admin).text("code")).isEqualTo("NOTE_REQUIRED");
		JsonNode done = post(decision, Map.of("outcome", "PART_REFUND", "amount", 300, "note", "Screen repair costs 300 birr."), admin).body();
		assertThat(done.path("status").asString()).isEqualTo("PART_REFUNDED");
		assertThat(done.path("refundAmount").decimalValue()).isEqualByComparingTo("300.00");
		assertThat(bal(s, "held")).isEqualByComparingTo("0");
		assertThat(bal(s, "available")).isEqualByComparingTo("850.00");
		assertThat(get("/api/admin/refunds", admin).raw()).contains(n);
		assertThat(post("/api/disputes/" + id + "/messages", Map.of("body", "Thanks"), buyer).text("code")).isEqualTo("PROBLEM_CLOSED");
	}

	@Test
	void fullRefundPaysSellerNothing_andWithdrawnProblemsLetMoneyGo() {
		Seller s = seller();
		String refunded = buyAndPay(s.productId());
		String buyer = shopperToken();
		long id = post("/api/orders/" + refunded + "/parcels/1/disputes", Map.of("reason", "NOT_RECEIVED", "details", "Nothing came after a week."), buyer)
				.body().path("id").asLong();
		JsonNode done = post("/api/admin/disputes/" + id + "/decision", Map.of("outcome", "REFUND", "note", "Seller couldn't deliver."), admin).body();
		assertThat(done.path("status").asString()).isEqualTo("REFUNDED");
		assertThat(done.path("refundAmount").decimalValue()).isEqualByComparingTo("1150.00");
		assertThat(bal(s, "held")).isEqualByComparingTo("0");
		assertThat(bal(s, "available")).isEqualByComparingTo("0");

		// a withdrawn problem: the buyer's receipt then releases the money as usual
		String other = buyAndPay(s.productId());
		long second = post("/api/orders/" + other + "/parcels/1/disputes", Map.of("reason", "WRONG_ITEM", "details", "Got the blue one, not black."), buyer)
				.body().path("id").asLong();
		post("/api/seller/orders/" + other + "/fulfilment", Map.of("status", "SHIPPED"), s.token());
		assertThat(post("/api/disputes/" + second + "/withdraw", Map.of(), buyer).body().path("status").asString()).isEqualTo("WITHDRAWN");
		post("/api/orders/" + other + "/parcels/1/received", Map.of(), buyer);
		assertThat(bal(s, "available")).isEqualByComparingTo("1150.00");
		assertThat(post("/api/admin/disputes/" + second + "/decision", Map.of("outcome", "REFUND", "note", "late"), admin).text("code"))
				.isEqualTo("PROBLEM_CLOSED");
	}
}
