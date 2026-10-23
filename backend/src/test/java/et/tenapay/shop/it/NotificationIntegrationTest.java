package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import et.tenapay.shop.notification.NotificationRepository;
import et.tenapay.shop.notification.NotificationService;
import tools.jackson.databind.JsonNode;

/** Customer emails, read back from a real Mailpit inbox (SMTP + HTTP API). */
class NotificationIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0933445566";

	@Autowired
	NotificationService notificationService;
	@Autowired
	NotificationRepository notifications;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("500.00"), 10);
	}

	private record Mail(String id, String subject, String text, String html) {
	}

	/** Messages Mailpit received for this address, oldest first. */
	private List<Mail> inbox(String email) {
		try {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q)).build(),
					HttpResponse.BodyHandlers.ofString()).body());
			List<Mail> out = new ArrayList<>();
			for (JsonNode m : list.path("messages")) {
				JsonNode full = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/message/"
						+ m.path("ID").asString())).build(), HttpResponse.BodyHandlers.ofString()).body());
				out.add(new Mail(m.path("ID").asString(), full.path("Subject").asString(), full.path("Text").asString(),
						full.path("HTML").asString()));
			}
			java.util.Collections.reverse(out);
			return out;
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private List<String> subjects(String email) {
		return inbox(email).stream().map(Mail::subject).toList();
	}

	private String order(String email, String name, String paymentId) {
		BillPayFake.acceptsPayments(billPay, paymentId);
		Map<String, Object> body = new HashMap<>(checkoutBody(productId, 1, PHONE));
		body.put("customer", Map.of("name", name, "phone", PHONE, "email", email));
		Res r = post("/api/checkout", body);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("orderNumber");
	}

	@Test
	void customerGetsEmailsFromOrderToDelivery() {
		String email = unique("mail").toLowerCase() + "@it.test";
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = order(email, "Hana <b>Girma</b>", paymentId);

		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.containsExactly("We got your order " + orderNumber));
		Mail placed = inbox(email).getFirst();
		assertThat(placed.text()).contains("ETB 500.00").contains("ETB 150.00").contains("ETB 650.00")
				.contains("/orders/track?order=" + orderNumber);
		// names are escaped in the HTML version
		assertThat(placed.html()).contains("Hana").doesNotContain("<b>Girma</b>");

		String webhook = BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("650.00"));
		sendWebhook(webhook);
		sendWebhook(webhook); // BillPay re-delivery: no second email
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.contains("Payment confirmed for " + orderNumber));

		post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "SHIPPED", "note", "Rider Abel 0911 222 333"), admin);
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.contains("Your order " + orderNumber + " is on the way"));
		assertThat(inbox(email).getLast().text()).contains("Rider Abel 0911 222 333").contains("Bole");

		post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "DELIVERED"), admin);
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.containsExactly("We got your order " + orderNumber, "Payment confirmed for " + orderNumber,
						"Your order " + orderNumber + " is on the way", "Delivered: " + orderNumber));

		// the admin sees the same four on the order
		JsonNode emails = get("/api/admin/orders/" + orderNumber, admin).body().path("emails");
		assertThat(emails.findValuesAsString("status")).containsOnly("SENT").hasSize(4);
	}

	@Test
	void failedPaymentAndCancelSendTheirOwnEmails() {
		String email = unique("fail").toLowerCase() + "@it.test";
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = order(email, "Dawit Bekele", paymentId);
		String attemptId = get("/api/admin/orders/" + orderNumber, admin).body().path("attempts").get(0).path("id").asString();

		BillPayFake.paymentStatus(billPay, paymentId, orderNumber + "-A1", new BigDecimal("650.00"), "FAILED", "INSUFFICIENT_FUNDS");
		post("/api/admin/payments/" + attemptId + "/reconcile", Map.of(), admin);
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.contains("Your payment for " + orderNumber + " didn't go through"));
		assertThat(inbox(email).getLast().text()).contains("There wasn't enough money");

		post("/api/orders/" + orderNumber + "/cancel", Map.of("phone", PHONE));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.contains("Order " + orderNumber + " cancelled"));
	}

	@Test
	void sameEventTwiceSendsOneEmail() {
		String email = unique("dup").toLowerCase() + "@it.test";
		String orderNumber = order(email, "Dup Test", UUID.randomUUID().toString());
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email)).hasSize(1));

		Instant at = Instant.now();
		notificationService.onOrderEvent("order.expired", orderNumber, at);
		notificationService.onOrderEvent("order.expired", orderNumber, at);
		notificationService.onOrderEvent("order.payment.retry", orderNumber, at); // not an email
		assertThat(subjects(email)).containsExactly("We got your order " + orderNumber, "Order " + orderNumber + " expired");
	}

	@Test
	void passwordChangeIsConfirmedByEmail() {
		String email = unique("pw").toLowerCase() + "@it.test";
		String token = post("/api/auth/register", Map.of("fullName", "Meron Alemu", "email", email, "password", "Str0ng-pass"))
				.body().path("token").asString();
		Res r = post("/api/me/password", Map.of("currentPassword", "Str0ng-pass", "newPassword", "Even-str0nger"), token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.containsExactly("Your TenaShop password was changed"));
		assertThat(inbox(email).getFirst().text()).contains("Hi Meron").contains("signed out");

		Res list = get("/api/admin/notifications", admin);
		assertThat(list.status()).isEqualTo(200);
		assertThat(list.body().path("page").path("content").findValuesAsString("recipient")).contains(email);
	}
}
