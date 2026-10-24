package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/** In-app notifications from orders, chat and jobs; read state; SMS choices. */
class InboxIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private static String phone() {
		return "09" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
	}

	private String customer(String name, String phone) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("inbox") + "@it.test", "phone", phone,
				"password", "Inbox-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("token");
	}

	private JsonNode inbox(String token) {
		return get("/api/me/inbox", token).body();
	}

	private long productOfNewShop(String sellerToken, String shopPhone) {
		String admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Inbox Cat")), admin).body();
		long categoryId = cats.get(cats.size() - 1).path("id").asLong();
		long shopId = post("/api/seller/shop", Map.of("kind", "SHOP", "name", unique("Inbox Shop"), "phone", shopPhone,
				"area", "Arada", "description", "x"), sellerToken).body().path("id").asLong();
		Map<String, Object> p = new LinkedHashMap<>();
		p.put("name", unique("Item"));
		p.put("categoryId", categoryId);
		p.put("price", new BigDecimal("500.00"));
		p.put("stock", 5);
		p.put("lowStockThreshold", 1);
		p.put("active", true);
		long productId = post("/api/seller/products", p, sellerToken).body().path("product").path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		return productId;
	}

	@Test
	void chatMessagesNotifyOncePerHourAndCanBeMarkedRead() {
		String sellerPhone = phone();
		String seller = customer("Inbox Seller", sellerPhone);
		long productId = productOfNewShop(seller, sellerPhone);
		String buyer = customer("Mekdes Buyer", phone());

		long chat = post("/api/chats", Map.of("productId", productId, "text", "Hello!"), buyer).body().path("id").asLong();
		post("/api/chats/" + chat + "/messages", Map.of("text", "Still there?"), buyer);

		JsonNode box = inbox(seller);
		assertThat(box.path("unread").asLong()).isEqualTo(1);
		JsonNode item = box.path("items").path("content").get(0);
		assertThat(item.path("kind").asString()).isEqualTo("CHAT");
		assertThat(item.path("title").asString()).isEqualTo("New message from Mekdes Buyer");
		assertThat(item.path("link").asString()).isEqualTo("/chats/" + chat);
		assertThat(get("/api/me/inbox/unread", seller).body().path("unread").asLong()).isEqualTo(1);

		post("/api/me/inbox/read", Map.of("id", item.path("id").asLong()), seller);
		assertThat(inbox(seller).path("unread").asLong()).isZero();
		assertThat(inbox(buyer).path("unread").asLong()).isZero(); // the sender isn't notified
	}

	@Test
	void smsChoicesAreRespected() {
		String sellerPhone = phone();
		String seller = customer("Quiet Seller", sellerPhone);
		long productId = productOfNewShop(seller, sellerPhone);
		JsonNode prefs = put("/api/me/notification-prefs", Map.of("smsOrders", true, "smsChat", false, "smsJobs", true), seller).body();
		assertThat(prefs.path("smsChat").asBoolean()).isFalse();
		assertThat(get("/api/me/notification-prefs", seller).body().path("smsChat").asBoolean()).isFalse();

		String buyer = customer("Chatty Buyer", phone());
		post("/api/chats", Map.of("productId", productId, "text", "Hi"), buyer);
		// the in-app notification still arrives, the SMS doesn't
		assertThat(inbox(seller).path("unread").asLong()).isEqualTo(1);
		String intl = "+251" + sellerPhone.substring(1);
		await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(4)).untilAsserted(() -> assertThat(
				jdbc.queryForObject("select count(*) from sms_messages where kind = 'CHAT' and recipient = ?", Long.class, intl)).isZero());
	}

	@Test
	void paidOrderNotifiesTheBuyerInTheApp() {
		String buyer = shopperToken();
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("700.00"), 5);
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		String orderNumber = post("/api/checkout", checkoutBody(productId, 1, "0933000222")).text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("850.00")));
		await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> assertThat(
				inbox(buyer).path("items").path("content").findValuesAsString("link")).contains("/orders/track?order=" + orderNumber));
	}
}
