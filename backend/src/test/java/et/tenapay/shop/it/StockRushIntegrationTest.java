package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

/**
 * Many shoppers at once for the last units: exactly the stock is sold, never more. Guards the single-statement stock
 * reservation (ProductRepository.reserveIfAvailable) that replaced row locks held for the whole checkout.
 */
class StockRushIntegrationTest extends IntegrationTest {

	private List<Res> rush(int shoppers, Callable<Res> buy) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(shoppers);
		try {
			List<Callable<Res>> tasks = new ArrayList<>();
			for (int i = 0; i < shoppers; i++) {
				tasks.add(buy);
			}
			List<Res> out = new ArrayList<>();
			for (Future<Res> f : pool.invokeAll(tasks)) {
				out.add(f.get());
			}
			return out;
		} finally {
			pool.shutdown();
		}
	}

	@Test
	void twentyShoppersForFiveUnits_exactlyFiveOrders() throws Exception {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("300.00"), 5);
		BillPayFake.acceptsEveryPayment(billPay);
		shopperToken(); // sign up once, outside the rush

		List<Res> results = rush(20, () -> post("/api/checkout", checkoutBody(productId, 1, "0911223344")));

		long ok = results.stream().filter(r -> r.status() == 200).count();
		long soldOut = results.stream().filter(r -> r.status() == 409 && "CART_INVALID".equals(r.text("code"))).count();
		assertThat(ok).as(results.stream().map(r -> r.status() + " " + r.text("code")).toList().toString()).isEqualTo(5);
		assertThat(soldOut).isEqualTo(15);
		var product = adminProduct(productId, admin);
		assertThat(product.path("reserved").asInt()).isEqualTo(5);
		assertThat(product.path("available").asInt()).isZero();
	}

	@Test
	void ordersForTheSameProductsInDifferentOrder_neitherWaitsForever() throws Exception {
		String admin = adminToken();
		long a = createProduct(admin, new BigDecimal("100.00"), 100);
		long b = createProduct(admin, new BigDecimal("200.00"), 100);
		BillPayFake.acceptsEveryPayment(billPay);
		shopperToken();
		Callable<Res> ab = () -> post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", a, "quantity", 1), Map.of("productId", b, "quantity", 1)),
				"customer", Map.of("name", "Test Buyer", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "Bole, Atlas area, house 12", "city", "Addis Ababa")));
		Callable<Res> ba = () -> post("/api/checkout", Map.of(
				"items", List.of(Map.of("productId", b, "quantity", 1), Map.of("productId", a, "quantity", 1)),
				"customer", Map.of("name", "Test Buyer", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "Bole, Atlas area, house 12", "city", "Addis Ababa")));
		List<Callable<Res>> mixed = new ArrayList<>();
		for (int i = 0; i < 10; i++) {
			mixed.add(i % 2 == 0 ? ab : ba);
		}
		ExecutorService pool = Executors.newFixedThreadPool(10);
		List<Res> results = new ArrayList<>();
		try {
			for (Future<Res> f : pool.invokeAll(mixed)) {
				results.add(f.get());
			}
		} finally {
			pool.shutdown();
		}
		assertThat(results).allSatisfy(r -> assertThat(r.status()).as(r.raw()).isEqualTo(200));
		assertThat(adminProduct(a, admin).path("reserved").asInt()).isEqualTo(10);
		assertThat(adminProduct(b, admin).path("reserved").asInt()).isEqualTo(10);

		// paying one turns its reservation into a sale
		String orderNumber = results.getFirst().text("orderNumber");
		sendWebhook(BillPayFake.capturedWebhook("pay-" + orderNumber + "-A1", orderNumber + "-A1", new BigDecimal("450.00")));
		await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
			assertThat(adminProduct(a, admin).path("stock").asInt()).isEqualTo(99);
			assertThat(adminProduct(a, admin).path("reserved").asInt()).isEqualTo(9);
		});
	}
}
