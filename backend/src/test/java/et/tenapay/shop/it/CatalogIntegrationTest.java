package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Admin catalog management and the rules the store depends on. */
class CatalogIntegrationTest extends IntegrationTest {

	private String admin;
	private long productId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		productId = createProduct(admin, new BigDecimal("250.00"), 6);
	}

	private static byte[] jpeg(int w, int h, Color color) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		var g = img.createGraphics();
		g.setColor(color);
		g.fillRect(0, 0, w, h);
		g.setColor(Color.WHITE);
		g.fillOval(w / 4, h / 4, w / 2, h / 2);
		g.dispose();
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(img, "jpg", out);
			return out.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private Res uploadPhoto(long id, byte[] bytes) {
		return upload("/api/admin/products/" + id + "/images", "photo.jpg", "image/jpeg", bytes, admin);
	}

	private String slug() {
		return adminProduct(productId, admin).path("slug").asString();
	}

	@Test
	void hiddenProductsDisappearFromTheStoreButStayInAdmin() {
		String slug = slug();
		assertThat(get("/api/products/" + slug).status()).isEqualTo(200);

		assertThat(patch("/api/admin/products/" + productId + "/visibility", Map.of("active", false), admin).status())
				.isEqualTo(200);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(404);
		assertThat(adminProduct(productId, admin).path("active").asBoolean()).isFalse();

		patch("/api/admin/products/" + productId + "/visibility", Map.of("active", true), admin);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(200);
	}

	@Test
	void hidingACategoryHidesItsProducts() {
		long categoryId = adminProduct(productId, admin).path("categoryId").asLong();
		String slug = slug();

		assertThat(patch("/api/admin/categories/" + categoryId, Map.of("active", false), admin).status()).isEqualTo(200);

		assertThat(get("/api/products/" + slug).status()).isEqualTo(404);
		JsonNode categories = get("/api/categories").body();
		assertThat(categories.findValuesAsString("id")).doesNotContain(String.valueOf(categoryId));
	}

	@Test
	void photosAreResizedServedReorderedAndLimitedToFive() {
		Res first = uploadPhoto(productId, jpeg(1600, 1200, Color.RED));
		assertThat(first.status()).as(first.raw()).isEqualTo(200);
		JsonNode img = first.body().path("images").get(0);
		assertThat(img.path("width").asInt()).isLessThanOrEqualTo(1200);

		HttpResponse<byte[]> served = getBytes(img.path("url").asString());
		assertThat(served.statusCode()).isEqualTo(200);
		assertThat(served.headers().firstValue("Content-Type")).hasValue("image/jpeg");
		assertThat(served.headers().firstValue("Cache-Control").orElse("")).contains("immutable");
		assertThat(getBytes(img.path("thumbUrl").asString()).statusCode()).isEqualTo(200);

		for (int i = 0; i < 4; i++) {
			assertThat(uploadPhoto(productId, jpeg(800, 800, Color.BLUE)).status()).isEqualTo(200);
		}
		Res sixth = uploadPhoto(productId, jpeg(800, 800, Color.GREEN));
		assertThat(sixth.status()).isEqualTo(409);
		assertThat(sixth.text("code")).isEqualTo("TOO_MANY_IMAGES");

		// make the last photo the main one; the store's main image follows
		JsonNode images = get("/api/admin/products/" + productId, admin).body().path("images");
		List<Long> ids = new java.util.ArrayList<>(images.findValues("id").stream().map(JsonNode::asLong).toList());
		java.util.Collections.reverse(ids);
		Res reordered = put("/api/admin/products/" + productId + "/images/order", Map.of("ids", ids), admin);
		assertThat(reordered.status()).as(reordered.raw()).isEqualTo(200);
		String mainUrl = reordered.body().path("images").get(0).path("url").asString();
		assertThat(reordered.body().path("product").path("imageUrl").asString()).isEqualTo(mainUrl);
		JsonNode store = get("/api/products/" + slug()).body();
		assertThat(store.path("images")).hasSize(5);
		assertThat(store.path("images").get(0).path("url").asString()).isEqualTo(mainUrl);
	}

	@Test
	void fakeImagesAreRefused() {
		Res r = upload("/api/admin/products/" + productId + "/images", "evil.jpg", "image/jpeg",
				"<?php echo 'hi'; ?>".getBytes(), admin);
		assertThat(r.status()).isEqualTo(400);
		assertThat(r.text("code")).isEqualTo("INVALID_IMAGE");
		Res tiny = uploadPhoto(productId, jpeg(100, 100, Color.RED));
		assertThat(tiny.status()).isEqualTo(400);
	}

	@Test
	void stockCantDropBelowWhatUnpaidOrdersHold() {
		BillPayFake.acceptsPayments(billPay, UUID.randomUUID().toString());
		Res order = post("/api/checkout", checkoutBody(productId, 4, "0911223344"));
		assertThat(order.status()).as(order.raw()).isEqualTo(200);

		Res tooMuch = post("/api/admin/products/" + productId + "/stock", Map.of("delta", -3, "reason", "damaged"), admin);
		assertThat(tooMuch.status()).isEqualTo(409);
		assertThat(tooMuch.text("code")).isEqualTo("BELOW_RESERVED");

		Res ok = post("/api/admin/products/" + productId + "/stock", Map.of("delta", -2, "reason", "damaged"), admin);
		assertThat(ok.status()).isEqualTo(200);
		JsonNode p = ok.body().path("product");
		assertThat(p.path("stock").asInt()).isEqualTo(4);
		assertThat(p.path("available").asInt()).isZero();

		// the store now shows it as sold out
		JsonNode store = get("/api/products/" + slug()).body();
		assertThat(store.path("available").asInt()).isZero();
	}

	@Test
	void duplicateIsHiddenWithNoStockAndOwnPhotos() {
		uploadPhoto(productId, jpeg(800, 800, Color.ORANGE));
		Res copy = post("/api/admin/products/" + productId + "/duplicate", Map.of(), admin);
		assertThat(copy.status()).as(copy.raw()).isEqualTo(200);
		JsonNode p = copy.body().path("product");
		assertThat(p.path("id").asLong()).isNotEqualTo(productId);
		assertThat(p.path("active").asBoolean()).isFalse();
		assertThat(p.path("stock").asInt()).isZero();
		JsonNode photo = copy.body().path("images").get(0);
		assertThat(photo.path("url").asString()).contains("/products/" + p.path("id").asLong() + "/");
		assertThat(getBytes(photo.path("url").asString()).statusCode()).isEqualTo(200);
	}

	@Test
	void everyChangeIsRecordedWithWhoMadeIt() {
		JsonNode before = adminProduct(productId, admin);
		Res r = put("/api/admin/products/" + productId, Map.of("name", before.path("name").asString(),
				"categoryId", before.path("categoryId").asLong(), "price", "275.00", "stock", 6), admin);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);

		JsonNode changes = get("/api/admin/products/" + productId + "/changes", admin).body();
		String all = changes.toString();
		assertThat(all).contains("250").contains("275").contains(ADMIN_EMAIL);
	}

	@Test
	void slugsStayUnique() {
		JsonNode p = adminProduct(productId, admin);
		Res clash = post("/api/admin/products", Map.of("name", p.path("name").asString(),
				"categoryId", p.path("categoryId").asLong(), "price", "10.00", "stock", 1), admin);
		assertThat(clash.status()).as(clash.raw()).isEqualTo(200);
		assertThat(clash.body().path("product").path("slug").asString()).isNotEqualTo(p.path("slug").asString());
	}
}
