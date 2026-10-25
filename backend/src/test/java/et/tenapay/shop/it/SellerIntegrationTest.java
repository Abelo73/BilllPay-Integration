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
 * Many sellers (Sodo Gebeya M3): a shop sells only once staff approve it, two shops never reach each other's products
 * or orders, and a seller sees only their own lines of an order.
 */
class SellerIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Seller Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
		BillPayFake.acceptsEveryPayment(billPay);
	}

	// ---------- helpers ----------

	private String customer(String name) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("seller") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("token").asString();
	}

	private JsonNode openShop(String token, String name) {
		Res r = post("/api/seller/shop", Map.of("kind", "SHOP", "name", name, "phone", "0912345678",
				"area", "Arada", "description", "Clothes and shoes"), token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body();
	}

	private long sellerProduct(String token, String price, int stock) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Seller item"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal(price));
		req.put("stock", stock);
		req.put("lowStockThreshold", 1);
		req.put("active", true);
		Res r = post("/api/seller/products", req, token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("product").path("id").asLong();
	}

	private Res decide(long shopId, String status, String note) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("status", status);
		if (note != null) {
			body.put("note", note);
		}
		return post("/api/admin/shops/" + shopId + "/decision", body, admin);
	}

	private String slugOf(long productId) {
		return adminProduct(productId, admin).path("slug").asString();
	}

	private Map<String, Object> cart(List<Long> productIds) {
		return Map.of(
				"items", productIds.stream().map(id -> Map.of("productId", id, "quantity", 1)).toList(),
				"customer", Map.of("name", "Hana Girma", "phone", "0911223344", "email", "buyer@it.test"),
				"delivery", Map.of("address", "University area, block 4", "city", "Wolaita Sodo", "notes", "Call first"));
	}

	/** Places and pays an order; returns its number once it shows PAID. */
	private String buyAndPay(List<Long> productIds) {
		String buyer = shopperToken();
		Res r = post("/api/checkout", cart(productIds), buyer);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		String orderNumber = r.text("orderNumber");
		BigDecimal total = get("/api/orders/" + orderNumber + "/status", buyer).body().path("total").decimalValue();
		sendWebhook(BillPayFake.capturedWebhook("pay-" + orderNumber + "-A1", orderNumber + "-A1", total));
		await().atMost(Duration.ofSeconds(30)).until(() ->
				"PAID".equals(get("/api/orders/" + orderNumber + "/status", buyer).text("status")));
		return orderNumber;
	}

	/** The value at {@code path} of every element of a JSON array. */
	private static List<String> strings(JsonNode array, String... path) {
		List<String> out = new java.util.ArrayList<>();
		for (JsonNode n : array) {
			JsonNode v = n;
			for (String p : path) {
				v = v.path(p);
			}
			out.add(v.asString());
		}
		return out;
	}

	private static List<Long> longs(JsonNode array, String... path) {
		return strings(array, path).stream().map(Long::valueOf).toList();
	}

	// ---------- tests ----------

	@Test
	void shopSellsOnlyAfterApproval() {
		String seller = customer("Marta Bekele");
		JsonNode shop = openShop(seller, unique("Marta Boutique"));
		assertThat(shop.path("status").asString()).isEqualTo("PENDING");
		String shopSlug = shop.path("slug").asString();

		// the seller can prepare products while waiting, but shoppers can't see or buy them
		long productId = sellerProduct(seller, "1200.00", 5);
		String slug = slugOf(productId);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(404);
		assertThat(get("/api/shops/" + shopSlug).status()).isEqualTo(404);
		Res early = post("/api/checkout", cart(List.of(productId)), shopperToken());
		assertThat(early.status()).isEqualTo(409);
		assertThat(early.text("code")).isEqualTo("CART_INVALID");
		assertThat(adminProduct(productId, admin).path("inStore").asBoolean()).isFalse();

		// staff see it in the queue and approve it; the seller gets an SMS
		JsonNode queue = get("/api/admin/shops?status=PENDING", admin).body();
		assertThat(strings(queue.path("page").path("content"), "shop", "slug")).contains(shopSlug);
		Res approved = decide(shop.path("id").asLong(), "APPROVED", null);
		assertThat(approved.status()).as(approved.raw()).isEqualTo(200);
		assertThat(approved.body().path("shop").path("status").asString()).isEqualTo("APPROVED");
		await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(
				get("/api/admin/sms?q=912345678", admin).raw()).contains("is approved"));

		// now it's in the store, with who sells it, on its own shop page
		JsonNode product = get("/api/products/" + slug).body();
		assertThat(product.path("seller").path("slug").asString()).isEqualTo(shopSlug);
		assertThat(product.path("seller").path("area").asString()).isEqualTo("Arada");
		JsonNode page = get("/api/shops/" + shopSlug).body();
		assertThat(page.path("productCount").asLong()).isEqualTo(1);
		assertThat(page.has("phone")).isFalse();
		JsonNode list = get("/api/products?shop=" + shopSlug).body();
		assertThat(strings(list.path("content"), "slug")).containsExactly(slug);
		assertThat(post("/api/checkout", cart(List.of(productId)), shopperToken()).status()).isEqualTo(200);

		// suspended: off the store again
		assertThat(decide(shop.path("id").asLong(), "SUSPENDED", null).status()).isEqualTo(400); // needs a reason
		assertThat(decide(shop.path("id").asLong(), "SUSPENDED", "Selling fake brands").status()).isEqualTo(200);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(404);
		assertThat(get("/api/seller/shop", seller).body().path("statusNote").asString()).isEqualTo("Selling fake brands");
	}

	@Test
	void twoShopsCannotSeeOrChangeEachOthersProducts() {
		String a = customer("Seller A");
		String b = customer("Seller B");
		openShop(a, unique("Shop A"));
		openShop(b, unique("Shop B"));
		long mine = sellerProduct(a, "300.00", 3);
		long theirs = sellerProduct(b, "400.00", 3);

		assertThat(longs(get("/api/seller/products", a).body().path("content"), "id")).containsExactly(mine);
		assertThat(longs(get("/api/seller/products", b).body().path("content"), "id")).containsExactly(theirs);

		Map<String, Object> edit = new LinkedHashMap<>();
		edit.put("name", "Taken over");
		edit.put("categoryId", categoryId);
		edit.put("price", new BigDecimal("1.00"));
		edit.put("lowStockThreshold", 1);
		edit.put("active", true);
		assertThat(get("/api/seller/products/" + theirs, a).status()).isEqualTo(404);
		assertThat(put("/api/seller/products/" + theirs, edit, a).status()).isEqualTo(404);
		assertThat(post("/api/seller/products/" + theirs + "/stock", Map.of("delta", -3), a).status()).isEqualTo(404);
		assertThat(patch("/api/seller/products/" + theirs + "/visibility", Map.of("active", false), a).status()).isEqualTo(404);
		assertThat(post("/api/seller/products/" + theirs + "/duplicate", Map.of(), a).status()).isEqualTo(404);
		assertThat(get("/api/seller/products/" + theirs + "/changes", a).status()).isEqualTo(404);
		JsonNode untouched = adminProduct(theirs, admin);
		assertThat(untouched.path("price").decimalValue()).isEqualByComparingTo("400.00");
		assertThat(untouched.path("stock").asInt()).isEqualTo(3);

		// sellers can't reach Sodo Gebeya's own products either, nor the admin
		long house = createProduct(admin, new BigDecimal("500.00"), 3);
		assertThat(get("/api/seller/products/" + house, a).status()).isEqualTo(404);
		assertThat(get("/api/admin/products", a).status()).isEqualTo(403);

		// their own edit works, but can't feature it on the home page
		edit.put("name", "Shop A item, edited");
		edit.put("featured", true);
		Res ok = put("/api/seller/products/" + mine, edit, a);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		assertThat(ok.body().path("product").path("name").asString()).isEqualTo("Shop A item, edited");
		assertThat(ok.body().path("product").path("featured").asBoolean()).isFalse();

		// a duplicate stays in the same shop
		long copy = post("/api/seller/products/" + mine + "/duplicate", Map.of(), a).body().path("product").path("id").asLong();
		assertThat(adminProduct(copy, admin).path("shopId").asLong()).isEqualTo(adminProduct(mine, admin).path("shopId").asLong());

		// admin can filter by seller
		long shopA = adminProduct(mine, admin).path("shopId").asLong();
		assertThat(longs(get("/api/admin/products?seller=" + shopA, admin).body().path("content"), "id"))
				.containsExactlyInAnyOrder(mine, copy);
		assertThat(longs(get("/api/admin/products?seller=house&size=100", admin).body().path("content"), "id"))
				.contains(house).doesNotContain(mine, theirs);
	}

	@Test
	void sellerSeesOnlyPaidOrdersWithTheirItems_andDeliversTheirOwn() {
		String seller = customer("Selam Tesfaye");
		JsonNode shop = openShop(seller, unique("Selam Shoes"));
		decide(shop.path("id").asLong(), "APPROVED", null);
		long shoes = sellerProduct(seller, "2450.00", 10);
		long house = createProduct(admin, new BigDecimal("950.00"), 10);
		String other = customer("Other seller");
		JsonNode otherShop = openShop(other, unique("Other shop"));
		decide(otherShop.path("id").asLong(), "APPROVED", null);
		long otherItem = sellerProduct(other, "100.00", 10);

		// not paid yet: not the seller's business
		Res unpaid = post("/api/checkout", cart(List.of(shoes)), shopperToken());
		assertThat(strings(get("/api/seller/orders?tab=all", seller).body().path("content"), "orderNumber"))
				.doesNotContain(unpaid.text("orderNumber"));
		assertThat(get("/api/seller/orders/" + unpaid.text("orderNumber"), seller).status()).isEqualTo(404);

		// only their item: they see the buyer's details and deliver it themselves
		String own = buyAndPay(List.of(shoes));
		JsonNode toSend = get("/api/seller/orders?tab=send", seller).body().path("content");
		assertThat(strings(toSend, "orderNumber")).contains(own);
		JsonNode detail = get("/api/seller/orders/" + own, seller).body();
		assertThat(detail.path("order").path("customerName").asString()).isEqualTo("Hana Girma");
		assertThat(detail.path("customerPhone").asString()).isEqualTo("+251911223344");
		assertThat(detail.path("deliveryAddress").asString()).isEqualTo("University area, block 4");
		assertThat(detail.path("order").path("itemsTotal").decimalValue()).isEqualByComparingTo("2450.00");
		assertThat(detail.path("order").path("otherSellers").asBoolean()).isFalse();
		assertThat(get("/api/seller/orders/" + own, other).status()).isEqualTo(404);

		assertThat(post("/api/seller/orders/" + own + "/fulfilment", Map.of("status", "CANCELLED"), seller).status())
				.isEqualTo(403);
		assertThat(post("/api/seller/orders/" + own + "/fulfilment", Map.of("status", "PROCESSING"), seller).status())
				.isEqualTo(200);
		Res shipped = post("/api/seller/orders/" + own + "/fulfilment",
				Map.of("status", "SHIPPED", "note", "Bajaj rider Dawit, 0916 000 111"), seller);
		assertThat(shipped.status()).as(shipped.raw()).isEqualTo(200);
		assertThat(shipped.body().path("order").path("fulfilmentStatus").asString()).isEqualTo("SHIPPED");
		assertThat(get("/api/orders/" + own + "/status", shopperToken()).body().path("delivery").path("fulfilmentStatus")
				.asString()).isEqualTo("SHIPPED");
		assertThat(strings(get("/api/seller/orders?tab=way", seller).body().path("content"), "orderNumber"))
				.contains(own);

		// bought together with Sodo Gebeya's and another seller's items: each seller gets their own parcel to deliver
		String mixed = buyAndPay(List.of(shoes, house, otherItem));
		JsonNode m = get("/api/seller/orders/" + mixed, seller).body();
		assertThat(longs(m.path("items"), "productId")).containsExactly(shoes);
		assertThat(m.path("order").path("itemsTotal").decimalValue()).isEqualByComparingTo("2450.00");
		assertThat(m.path("order").path("otherSellers").asBoolean()).isTrue();
		assertThat(m.path("order").path("parcelNumber").asString()).startsWith(mixed + "-");
		assertThat(m.path("customerPhone").asString()).isEqualTo("+251911223344");
		assertThat(strings(m.path("order").path("nextSteps"))).containsExactly("PROCESSING", "SHIPPED");
		assertThat(post("/api/seller/orders/" + mixed + "/fulfilment", Map.of("status", "PROCESSING"), seller).status())
				.isEqualTo(200);
		assertThat(longs(get("/api/seller/orders/" + mixed, other).body().path("items"), "productId"))
				.containsExactly(otherItem);
		assertThat(get("/api/seller/orders/" + mixed, other).body().path("order").path("fulfilmentStatus").asString())
				.isEqualTo("UNFULFILLED"); // the other seller's parcel didn't move

		// the dashboard counts their share only
		JsonNode summary = get("/api/seller/summary", seller).body();
		assertThat(summary.path("ordersThisMonth").asLong()).isEqualTo(2);
		assertThat(summary.path("salesThisMonth").decimalValue()).isEqualByComparingTo("4900.00");
		assertThat(summary.path("onTheWay").asLong()).isEqualTo(1);
		assertThat(summary.path("toSend").asLong()).isEqualTo(1);
	}

	@Test
	void accountRules() {
		String noShop = customer("Just a buyer");
		Res none = get("/api/seller/shop", noShop);
		assertThat(none.status()).isEqualTo(404);
		assertThat(none.text("code")).isEqualTo("NO_SHOP");
		assertThat(get("/api/seller/shop").status()).isEqualTo(401);
		assertThat(get("/api/seller/shop", admin).status()).isEqualTo(403);

		String seller = customer("Dawit Kebede");
		JsonNode shop = openShop(seller, unique("Dawit Electronics"));
		Res second = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", "Second shop", "phone", "0912345678"), seller);
		assertThat(second.status()).isEqualTo(409);
		assertThat(post("/api/seller/shop", Map.of("name", "Bad phone", "phone", "12345"), noShop).status()).isEqualTo(400);

		// hidden categories can't be used
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Hidden")), admin).body();
		long hiddenId = cats.get(cats.size() - 1).path("id").asLong();
		patch("/api/admin/categories/" + hiddenId, Map.of("active", false), admin);
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", "Phone charger");
		req.put("categoryId", hiddenId);
		req.put("price", new BigDecimal("350.00"));
		assertThat(post("/api/seller/products", req, seller).status()).isEqualTo(400);

		// rejected needs a reason; fixing the details sends it back to the queue
		long id = shop.path("id").asLong();
		assertThat(decide(id, "REJECTED", " ").status()).isEqualTo(400);
		assertThat(decide(id, "REJECTED", "Add a real shop name and area").status()).isEqualTo(200);
		JsonNode rejected = get("/api/seller/shop", seller).body();
		assertThat(rejected.path("status").asString()).isEqualTo("REJECTED");
		Res fixed = put("/api/seller/shop", Map.of("kind", "SHOP", "name", "Dawit Electronics Sodo", "phone", "0912345678",
				"area", "Merkato"), seller);
		assertThat(fixed.status()).as(fixed.raw()).isEqualTo(200);
		assertThat(fixed.body().path("status").asString()).isEqualTo("PENDING");
		assertThat(fixed.body().path("slug").asString()).isEqualTo(shop.path("slug").asString());
		assertThat(decide(id, "SUSPENDED", "x").status()).isEqualTo(409); // only approved shops can be paused
		assertThat(get("/api/admin/shops/" + id, admin).body().path("owner").path("fullName").asString())
				.isEqualTo("Dawit Kebede");
	}
}
