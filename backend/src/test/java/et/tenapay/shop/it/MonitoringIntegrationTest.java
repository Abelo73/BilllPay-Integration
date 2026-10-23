package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/** /actuator/prometheus is internal-only and carries the business metrics the Grafana dashboards use. */
class MonitoringIntegrationTest extends IntegrationTest {

	private String metrics() {
		Res r = get("/actuator/prometheus");
		assertThat(r.status()).isEqualTo(200);
		return r.raw();
	}

	@Test
	void metricsAreNotReachableThroughAProxy() {
		Res viaProxy = postRaw("/actuator/prometheus", "", Map.of());
		assertThat(viaProxy.status()).isIn(401, 403, 405);
		Res forwarded = send("/actuator/prometheus", Map.of("X-Forwarded-For", "203.0.113.7"));
		assertThat(forwarded.status()).isIn(401, 403);
	}

	private Res send(String path, Map<String, String> headers) {
		try {
			var b = java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl() + path)).GET();
			headers.forEach(b::header);
			var r = java.net.http.HttpClient.newHttpClient().send(b.build(),
					java.net.http.HttpResponse.BodyHandlers.ofString());
			return new Res(r.statusCode(), r.body(), null);
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void paymentAndWebhookMetricsMove() {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("99.00"), 5);
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);

		Res order = post("/api/checkout", checkoutBody(productId, 1, "0911223344"));
		String orderNumber = order.text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, orderNumber + "-A1", new BigDecimal("249.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
				get("/api/orders/" + orderNumber + "/status?phone=0911223344").text("status")).isEqualTo("PAID"));

		String m = metrics();
		assertThat(m).contains("tenashop_payments_requested_total{application=\"tenashop\",result=\"created\"}");
		assertThat(m).contains("tenashop_billpay_requests_seconds_count{application=\"tenashop\",operation=\"create_payment\",outcome=\"2xx\"}");
		assertThat(m).contains("tenashop_webhooks_received_total{application=\"tenashop\",result=\"accepted\"}");
		assertThat(m).containsPattern("tenashop_payments_status_total\\{[^}]*status=\"SUCCEEDED\"");
		assertThat(m).containsPattern("tenashop_orders_status_total\\{[^}]*status=\"PAID\"");
		assertThat(m).contains("tenashop_webhooks_processing_delay_seconds_count");
		// standard metrics the App dashboard relies on
		assertThat(m).contains("http_server_requests_seconds_bucket").contains("jvm_memory_used_bytes")
				.contains("hikaricp_connections_active");
	}
}
