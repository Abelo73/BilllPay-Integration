package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Admin reports and the CSV exports used to reconcile with BillPay. */
class ReportsIntegrationTest extends IntegrationTest {

	private static final String PHONE = "0944556677";

	private HttpResponse<String> download(String path, String token) {
		try {
			HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(baseUrl() + path)).GET();
			if (token != null) {
				b.header("Authorization", "Bearer " + token);
			}
			return HttpClient.newHttpClient().send(b.build(), HttpResponse.BodyHandlers.ofString());
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void reportShowsSalesProductsMethodsAndFailures_andCsvMatchesBillPay() {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("1200.00"), 20);

		// a paid order (2 × 1200 + 150 delivery)
		String paymentId = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, paymentId);
		Map<String, Object> body = new HashMap<>(checkoutBody(productId, 2, PHONE));
		body.put("customer", Map.of("name", "=HYPERLINK(\"http://evil\")", "phone", PHONE, "email", "csv@it.test"));
		String paid = post("/api/checkout", body).text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook(paymentId, paid + "-A1", new BigDecimal("2550.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
				get("/api/orders/" + paid + "/status?phone=" + PHONE).text("status")).isEqualTo("PAID"));

		// an order whose try failed for lack of funds
		String failedPayment = UUID.randomUUID().toString();
		BillPayFake.acceptsPayments(billPay, failedPayment);
		String open = post("/api/checkout", checkoutBody(productId, 1, PHONE)).text("orderNumber");
		String attemptId = get("/api/admin/orders/" + open, admin).body().path("attempts").get(0).path("id").asString();
		BillPayFake.paymentStatus(billPay, failedPayment, open + "-A1", new BigDecimal("1350.00"), "CREATED", "INSUFFICIENT_FUNDS");
		post("/api/admin/payments/" + attemptId + "/reconcile", Map.of(), admin);

		JsonNode report = get("/api/admin/reports?days=7", admin).body();
		assertThat(report.path("salesByDay")).hasSize(7);
		String today = LocalDate.now(ZoneId.of("Africa/Addis_Ababa")).toString();
		JsonNode todayRow = report.path("salesByDay").get(6);
		assertThat(todayRow.path("day").asString()).isEqualTo(today);
		assertThat(todayRow.path("paidOrders").asLong()).isGreaterThanOrEqualTo(1);
		assertThat(report.path("totals").path("revenue").decimalValue()).isGreaterThanOrEqualTo(new BigDecimal("2550"));

		JsonNode mine = null;
		for (JsonNode p : report.path("topProducts")) {
			if (p.path("productId").asLong() == productId) {
				mine = p;
			}
		}
		assertThat(mine).as("product in top products").isNotNull();
		assertThat(mine.path("quantity").asLong()).isEqualTo(2);
		assertThat(mine.path("revenue").decimalValue()).isEqualByComparingTo("2400");
		assertThat(report.path("byMethod").findValuesAsString("method")).contains("TEST_WALLET");
		assertThat(report.path("failureReasons").findValuesAsString("reason")).contains("INSUFFICIENT_FUNDS");

		HttpResponse<String> orders = download("/api/admin/reports/orders.csv?days=7", admin);
		assertThat(orders.statusCode()).isEqualTo(200);
		assertThat(orders.headers().firstValue("Content-Disposition").orElse("")).contains("attachment").contains(".csv");
		assertThat(orders.body()).startsWith("﻿order_number,created_at,status,");
		String paidLine = orders.body().lines().filter(l -> l.startsWith("\"" + paid + "\"")).findFirst().orElseThrow();
		assertThat(paidLine).contains("\"PAID\"").contains(paymentId).contains("2550.00").contains("\"+251944556677\"");
		// a name that looks like a formula is neutralised
		assertThat(paidLine).contains("\"'=HYPERLINK(\"\"http://evil\"\")\"");

		HttpResponse<String> payments = download("/api/admin/reports/payments.csv?days=7", admin);
		assertThat(payments.body()).contains("\"" + paid + "-A1\"").contains("\"" + open + "-A1\"").contains("INSUFFICIENT_FUNDS");
	}

	@Test
	void onlyStaffCanSeeReports() {
		assertThat(get("/api/admin/reports").status()).isEqualTo(401);
		assertThat(download("/api/admin/reports/orders.csv", null).statusCode()).isEqualTo(401);
		String email = unique("rep").toLowerCase() + "@it.test";
		String customer = post("/api/auth/register", Map.of("fullName", "Rep Test", "email", email, "password", "Str0ng-pass"))
				.body().path("token").asString();
		assertThat(get("/api/admin/reports", customer).status()).isEqualTo(403);
	}
}
