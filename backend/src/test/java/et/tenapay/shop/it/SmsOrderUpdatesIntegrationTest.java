package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import et.tenapay.shop.order.PaymentReminders;
import et.tenapay.shop.sms.SmsMessage;
import et.tenapay.shop.sms.SmsMessageRepository;

/** Order updates by SMS (test mode: stored as LOGGED, never sent). */
class SmsOrderUpdatesIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0944123456";

	@Autowired
	SmsMessageRepository sms;
	@Autowired
	PaymentReminders reminders;

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("12300.00"), 10);
	}

	private String order(String paymentId) {
		BillPayFake.acceptsPayments(billPay, paymentId);
		Res r = post("/api/checkout", checkoutBody(productId, 1, PHONE));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("orderNumber");
	}

	private List<SmsMessage> texts(String orderNumber) {
		return sms.findByOrderNumberOrderByCreatedAtAsc(orderNumber);
	}

	@Test
	void paidShippedDeliveredEachTextOnceAndFitOneSms() {
		String paymentId = UUID.randomUUID().toString();
		String orderNumber = order(paymentId);
		// placing an order sends no SMS (the email covers it)
		assertThat(texts(orderNumber)).isEmpty();

		String webhook = BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("12300.00"));
		sendWebhook(webhook);
		sendWebhook(webhook); // BillPay re-delivery
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(texts(orderNumber)).hasSize(1));
		SmsMessage paid = texts(orderNumber).getFirst();
		assertThat(paid.getKind()).isEqualTo("PAYMENT");
		assertThat(paid.getRecipient()).isEqualTo("+251944123456");
		assertThat(paid.getStatus()).isEqualTo(SmsMessage.Status.LOGGED);
		assertThat(paid.getBody()).contains("12,300 ETB").contains(orderNumber).contains("/orders/track?order=" + orderNumber);

		post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "SHIPPED", "note", "Rider Abel 0911 222 333"), admin);
		post("/api/admin/orders/" + orderNumber + "/fulfilment", Map.of("status", "DELIVERED"), admin);
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(texts(orderNumber)).hasSize(3));

		List<SmsMessage> all = texts(orderNumber);
		assertThat(all.get(1).getBody()).contains("is on the way").contains("Rider Abel 0911 222 333");
		assertThat(all.get(2).getBody()).contains("was delivered");
		assertThat(all).allSatisfy(m -> {
			assertThat(m.getBody().length()).as(m.getBody()).isLessThanOrEqualTo(160);
			assertThat(m.getBody()).as("plain GSM text, no Unicode").matches("[\\x20-\\x7E]+");
		});
	}

	@Test
	void reminderTextGoesOutOnceWithThePayByTime() {
		String orderNumber = order(UUID.randomUUID().toString());
		Instant later = Instant.now().plus(Duration.ofMinutes(21));
		reminders.sendDue(later);
		reminders.sendDue(later.plusSeconds(60));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(texts(orderNumber)).hasSize(1));
		assertThat(texts(orderNumber).getFirst().getBody()).contains("is not paid yet. Pay by ").matches(".*\\d\\d:\\d\\d.*");
	}
}
