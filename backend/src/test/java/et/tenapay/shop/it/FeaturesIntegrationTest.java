package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Admin → Features switches, and Jiji-style buying when online payment is off: contact the seller instead. */
class FeaturesIntegrationTest extends IntegrationTest {

	@AfterEach
	void backToTestDefaults() {
		String admin = adminToken();
		put("/api/admin/features/online_payments", Map.of("value", "true"), admin);
		put("/api/admin/features/show_seller_phone", Map.of("value", "true"), admin);
		put("/api/admin/features/support_phone", Map.of("value", ""), admin);
	}

	@Test
	void switchesAreForStaff_andTheStoreReadsThem() {
		String admin = adminToken();
		JsonNode list = get("/api/admin/features", admin).body();
		assertThat(list.toString()).contains("online_payments", "talent_profiles", "cv_basic_price");
		assertThat(get("/api/features").body().path("cv_basic_price").asString()).isEqualTo("199");
		assertThat(get("/api/features").body().has("max_open_cv_orders")).isFalse(); // staff-only setting

		assertThat(put("/api/admin/features/cv_basic_price", Map.of("value", "-5"), admin).status()).isEqualTo(400);
		assertThat(put("/api/admin/features/online_payments", Map.of("value", "maybe"), admin).status()).isEqualTo(400);
		assertThat(put("/api/admin/features/nope", Map.of("value", "true"), admin).status()).isEqualTo(404);
		assertThat(put("/api/admin/features/online_payments", Map.of("value", "false"), shopperToken()).status()).isEqualTo(403);
		assertThat(put("/api/admin/features/cv_basic_price", Map.of("value", "249"), admin).status()).isEqualTo(200);
		assertThat(get("/api/features").body().path("cv_basic_price").asString()).isEqualTo("249");
		put("/api/admin/features/cv_basic_price", Map.of("value", "199"), admin);
	}

	@Test
	void paymentsOff_buyersContactTheSellerInstead() {
		String admin = adminToken();
		long house = createProduct(admin, new BigDecimal("300.00"), 5);
		// a seller with a phone
		String seller = post("/api/auth/register", Map.of("fullName", "Contact Seller", "email", unique("cs") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026")).body().path("token").asString();
		long shopId = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", unique("Contact Shop"), "phone", "0916 555 444"), seller)
				.body().path("id").asLong();
		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Feat Cat")), admin).body();
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Used sofa"));
		req.put("categoryId", cats.get(cats.size() - 1).path("id").asLong());
		req.put("price", new BigDecimal("5000.00"));
		req.put("stock", 1);
		req.put("active", true);
		long sofa = post("/api/seller/products", req, seller).body().path("product").path("id").asLong();

		assertThat(put("/api/admin/features/online_payments", Map.of("value", "false"), admin).status()).isEqualTo(200);
		assertThat(get("/api/features").body().path("online_payments").asString()).isEqualTo("false");
		Res checkout = post("/api/checkout", checkoutBody(sofa, 1, "0911223344"));
		assertThat(checkout.status()).isEqualTo(409);
		assertThat(checkout.text("code")).isEqualTo("PAYMENTS_OFF");

		// contact: signed-in buyers only, counted for the seller
		assertThat(get("/api/products/" + sofa + "/contact").status()).isEqualTo(401);
		JsonNode c = get("/api/products/" + sofa + "/contact", shopperToken()).body();
		assertThat(c.path("phone").asString()).isEqualTo("+251916555444");
		assertThat(c.path("whatsapp").asString()).isEqualTo("https://wa.me/251916555444");
		assertThat(get("/api/seller/summary", seller).body().path("contacts30d").asLong()).isEqualTo(1);

		// Sodo Gebeya's own items use the support phone, once set
		assertThat(get("/api/products/" + house + "/contact", shopperToken()).text("code")).isEqualTo("NO_PHONE");
		put("/api/admin/features/support_phone", Map.of("value", "0911 000 000"), admin);
		assertThat(get("/api/products/" + house + "/contact", shopperToken()).body().path("name").asString()).isEqualTo("Sodo Gebeya");

		// staff can hide phones entirely (chat only)
		put("/api/admin/features/show_seller_phone", Map.of("value", "false"), admin);
		assertThat(get("/api/products/" + sofa + "/contact", shopperToken()).text("code")).isEqualTo("FEATURE_OFF");

		// back on: buying online works again
		put("/api/admin/features/online_payments", Map.of("value", "true"), admin);
		BillPayFake.acceptsEveryPayment(billPay);
		assertThat(post("/api/checkout", checkoutBody(sofa, 1, "0911223344")).status()).isEqualTo(200);
	}
}
