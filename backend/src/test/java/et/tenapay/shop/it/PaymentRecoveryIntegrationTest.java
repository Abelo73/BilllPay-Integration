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

import et.tenapay.shop.order.PaymentReminders;
import tools.jackson.databind.JsonNode;

/** Getting unpaid orders paid: the "finish paying" reminder, the pay-by time, and data for "Order again". */
class PaymentRecoveryIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0944556677";
	/** app.payment-expiry (30 min) minus app.payment-reminder-before (10 min), plus a margin. */
	private static final Duration INTO_REMINDER_WINDOW = Duration.ofMinutes(21);

	@Autowired
	PaymentReminders reminders;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("400.00"), 10);
	}

	private String order(String email, String paymentId) {
		BillPayFake.acceptsPayments(billPay, paymentId);
		Map<String, Object> body = new HashMap<>(checkoutBody(productId, 1, PHONE));
		body.put("customer", Map.of("name", "Selam Tesfaye", "phone", PHONE, "email", email));
		Res r = post("/api/checkout", body);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("orderNumber");
	}

	private List<String> subjects(String email) {
		try {
			HttpClient http = HttpClient.newHttpClient();
			String q = URLEncoder.encode("to:\"" + email + "\"", StandardCharsets.UTF_8);
			JsonNode list = json.readTree(http.send(HttpRequest.newBuilder(URI.create(mailpitApi() + "/api/v1/search?query=" + q))
					.build(), HttpResponse.BodyHandlers.ofString()).body());
			List<String> out = new ArrayList<>();
			for (JsonNode m : list.path("messages")) {
				out.add(m.path("Subject").asString());
			}
			return out;
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private List<String> timeline(String orderNumber) {
		return get("/api/admin/orders/" + orderNumber, admin).body().path("timeline").findValuesAsString("type");
	}

	@Test
	void unpaidOrderGetsOneReminderBeforeItExpires() {
		String email = unique("remind").toLowerCase() + "@it.test";
		String orderNumber = order(email, UUID.randomUUID().toString());

		// not due yet: the order is brand new
		reminders.sendDue(Instant.now());
		assertThat(timeline(orderNumber)).doesNotContain(PaymentReminders.EVENT);

		// 21 minutes later it's inside the window: one reminder, never two
		Instant later = Instant.now().plus(INTO_REMINDER_WINDOW);
		assertThat(reminders.sendDue(later)).isPositive();
		reminders.sendDue(later);
		reminders.sendDue(later.plusSeconds(60));

		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(subjects(email))
				.filteredOn(s -> s.startsWith("Your order " + orderNumber + " is waiting: pay by ")).hasSize(1));
		assertThat(timeline(orderNumber)).containsOnlyOnce(PaymentReminders.EVENT);
	}

	@Test
	void paidOrdersAreNotReminded() {
		String email = unique("paid").toLowerCase() + "@it.test";
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = order(email, paymentId);
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("550.00")));
		await().atMost(Duration.ofSeconds(30)).until(() -> "PAID".equals(
				get("/api/orders/" + orderNumber + "/status?phone=" + PHONE).text("status")));

		reminders.sendDue(Instant.now().plus(INTO_REMINDER_WINDOW));
		assertThat(timeline(orderNumber)).doesNotContain(PaymentReminders.EVENT);
	}

	@Test
	void statusShowsPayByWhileUnpaidAndProductLinksForOrderAgain() {
		String orderNumber = order(unique("payby").toLowerCase() + "@it.test", UUID.randomUUID().toString());
		Res status = get("/api/orders/" + orderNumber + "/status?phone=" + PHONE);
		assertThat(status.status()).isEqualTo(200);
		Instant payBy = Instant.parse(status.text("payBy"));
		Instant createdAt = Instant.parse(status.text("createdAt"));
		assertThat(Duration.between(createdAt, payBy)).isEqualTo(Duration.ofMinutes(30));
		JsonNode item = status.body().path("items").get(0);
		assertThat(item.path("productId").asLong()).isEqualTo(productId);
		assertThat(item.path("productSlug").asString()).isNotBlank();

		// once the order is closed there is no deadline any more
		post("/api/orders/" + orderNumber + "/cancel", Map.of("phone", PHONE));
		Res after = get("/api/orders/" + orderNumber + "/status?phone=" + PHONE);
		assertThat(after.text("status")).isEqualTo("CANCELLED");
		assertThat(after.text("payBy")).isNull();
	}
}
