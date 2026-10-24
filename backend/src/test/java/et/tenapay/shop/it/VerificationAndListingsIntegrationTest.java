package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Sodo Gebeya M4: the Verified badge with private ID photos, listing details, listing reports and areas. */
class VerificationAndListingsIntegrationTest extends IntegrationTest {

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("M4 Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
	}

	private static byte[] jpeg(Color color) {
		BufferedImage img = new BufferedImage(640, 420, BufferedImage.TYPE_INT_RGB);
		var g = img.createGraphics();
		g.setColor(color);
		g.fillRect(0, 0, 640, 420);
		g.dispose();
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(img, "jpg", out);
			return out.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private String customer(String name) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("m4") + "@it.test",
				"phone", "0912345678", "password", "Seller-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("token").asString();
	}

	private JsonNode shop(String token, String name) {
		Res r = post("/api/seller/shop", Map.of("kind", "INDIVIDUAL", "name", name, "phone", "0912345678", "area", "Arada"), token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body();
	}

	private Res photo(String token, String which, Color c) {
		return upload("/api/seller/verification/photos/" + which, which + ".jpg", "image/jpeg", jpeg(c), token);
	}

	private HttpResponse<byte[]> bytes(String path, String token) throws Exception {
		var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl() + path)).GET();
		if (token != null) {
			req.header("Authorization", "Bearer " + token);
		}
		return java.net.http.HttpClient.newHttpClient().send(req.build(), HttpResponse.BodyHandlers.ofByteArray());
	}

	private long listing(String token, Map<String, Object> extra) {
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", unique("Used phone"));
		req.put("categoryId", categoryId);
		req.put("price", new BigDecimal("7500.00"));
		req.put("stock", 1);
		req.put("active", true);
		req.putAll(extra);
		Res r = post("/api/seller/products", req, token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("product").path("id").asLong();
	}

	@Test
	void verifiedBadgeFlow_photosStayPrivate() throws Exception {
		String seller = customer("Abebe Tesfaye");
		JsonNode s = shop(seller, unique("Abebe Repairs"));
		long shopId = s.path("id").asLong();
		assertThat(get("/api/seller/verification", seller).body().path("status").asString()).isEqualTo("NONE");
		assertThat(post("/api/seller/verification/submit", Map.of(), seller).status()).isEqualTo(409);

		assertThat(photo(seller, "id-front", Color.BLUE).status()).isEqualTo(200);
		Res missing = post("/api/seller/verification/submit", Map.of(), seller);
		assertThat(missing.status()).isEqualTo(400);
		assertThat(missing.text("code")).isEqualTo("PHOTOS_MISSING");
		photo(seller, "id-back", Color.GREEN);
		JsonNode v = photo(seller, "selfie", Color.ORANGE).body();
		assertThat(v.path("idFront").asBoolean() && v.path("idBack").asBoolean() && v.path("selfie").asBoolean()).isTrue();
		assertThat(put("/api/seller/verification", Map.of("idType", "FAYDA", "details", "Licence 12/345"), seller).status())
				.isEqualTo(200);

		// the owner can see their photo, without caching; nobody else can, and the public media route never serves it
		HttpResponse<byte[]> own = bytes("/api/seller/verification/photos/selfie", seller);
		assertThat(own.statusCode()).isEqualTo(200);
		assertThat(own.headers().firstValue("Content-Type")).hasValue("image/jpeg");
		assertThat(own.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
		String other = customer("Someone else");
		shop(other, unique("Other shop"));
		assertThat(bytes("/api/seller/verification/photos/selfie", other).statusCode()).isEqualTo(404);
		assertThat(bytes("/api/seller/verification/photos/selfie", null).statusCode()).isEqualTo(401);
		assertThat(bytes("/api/media/private/verification/" + shopId + "/x-selfie.jpg", null).statusCode()).isEqualTo(404);

		JsonNode sent = post("/api/seller/verification/submit", Map.of(), seller).body();
		assertThat(sent.path("status").asString()).isEqualTo("SUBMITTED");
		Res locked = photo(seller, "selfie", Color.RED);
		assertThat(locked.status()).isEqualTo(409);
		assertThat(locked.text("code")).isEqualTo("VERIFICATION_WAITING");

		// staff see it in the queue with the photos, ask for a better one
		JsonNode queue = get("/api/admin/verifications?status=SUBMITTED&size=100", admin).body();
		long vid = sent.path("id").asLong();
		assertThat(queue.path("page").path("content").toString()).contains("\"id\":" + vid);
		assertThat(bytes("/api/admin/verifications/" + vid + "/photos/id-front", admin).statusCode()).isEqualTo(200);
		assertThat(bytes("/api/admin/verifications/" + vid + "/photos/id-front", seller).statusCode()).isEqualTo(403);
		assertThat(post("/api/admin/verifications/" + vid + "/decision", Map.of("status", "MORE_INFO"), admin).status())
				.isEqualTo(400);
		assertThat(post("/api/admin/verifications/" + vid + "/decision",
				Map.of("status", "MORE_INFO", "note", "The back of the ID is blurry"), admin).status()).isEqualTo(200);
		JsonNode back = get("/api/seller/verification", seller).body();
		assertThat(back.path("status").asString()).isEqualTo("MORE_INFO");
		assertThat(back.path("staffNote").asString()).isEqualTo("The back of the ID is blurry");

		// fix and send again; approve gives the badge everywhere
		assertThat(photo(seller, "id-back", Color.CYAN).status()).isEqualTo(200);
		assertThat(post("/api/seller/verification/submit", Map.of(), seller).status()).isEqualTo(200);
		Res approved = post("/api/admin/verifications/" + vid + "/decision", Map.of("status", "APPROVED"), admin);
		assertThat(approved.status()).as(approved.raw()).isEqualTo(200);
		assertThat(get("/api/seller/shop", seller).body().path("verifiedAt").isNull()).isFalse();
		assertThat(post("/api/admin/verifications/" + vid + "/decision", Map.of("status", "APPROVED"), admin).status())
				.isEqualTo(409);
		assertThat(photo(seller, "selfie", Color.RED).status()).isEqualTo(409); // already verified
		await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
				assertThat(get("/api/admin/sms?q=912345678", admin).raw()).contains("is now Verified"));

		post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		long item = listing(seller, Map.of());
		String slug = adminProduct(item, admin).path("slug").asString();
		assertThat(get("/api/products/" + slug).body().path("seller").path("verified").asBoolean()).isTrue();
		assertThat(get("/api/shops/" + s.path("slug").asString()).body().path("verified").asBoolean()).isTrue();
	}

	@Test
	void listingDetails_reports_takeDownAndPutBack() {
		String seller = customer("Selam Tesfaye");
		JsonNode s = shop(seller, unique("Selam Used Goods"));
		post("/api/admin/shops/" + s.path("id").asLong() + "/decision", Map.of("status", "APPROVED"), admin);
		long used = listing(seller, Map.of("condition", "USED", "negotiable", true, "area", "University area"));
		long plain = listing(seller, Map.of());
		JsonNode p = get("/api/products/" + adminProduct(used, admin).path("slug").asString()).body();
		assertThat(p.path("condition").asString()).isEqualTo("USED");
		assertThat(p.path("negotiable").asBoolean()).isTrue();
		assertThat(p.path("area").asString()).isEqualTo("University area");
		assertThat(get("/api/products/" + adminProduct(plain, admin).path("slug").asString()).body().path("area").asString())
				.isEqualTo("Arada"); // the shop's area

		// reports: signed-in shoppers only, once each, never on their own listing
		String buyer = customer("Careful Buyer");
		String slug = adminProduct(used, admin).path("slug").asString();
		assertThat(post("/api/products/" + used + "/report", Map.of("reason", "SCAM"), null).status()).isEqualTo(401);
		assertThat(post("/api/products/" + used + "/report", Map.of("reason", "SCAM", "details", "Price far too low"), buyer)
				.status()).isEqualTo(200);
		Res twice = post("/api/products/" + used + "/report", Map.of("reason", "FAKE"), buyer);
		assertThat(twice.status()).isEqualTo(409);
		assertThat(twice.text("code")).isEqualTo("ALREADY_REPORTED");
		assertThat(post("/api/products/" + used + "/report", Map.of("reason", "SCAM"), seller).status()).isEqualTo(400);
		post("/api/products/" + used + "/report", Map.of("reason", "SCAM"), customer("Second Buyer"));

		JsonNode open = get("/api/admin/listing-reports?status=OPEN", admin).body();
		JsonNode row = null;
		for (JsonNode r : open.path("page").path("content")) {
			if (r.path("productId").asLong() == used) {
				row = r;
			}
		}
		assertThat(row).isNotNull();
		assertThat(row.path("reports").asLong()).isEqualTo(2);
		assertThat(row.path("reasons").path("SCAM").asLong()).isEqualTo(2);
		assertThat(row.toString()).contains("Price far too low");

		// take down: gone from the store, the seller can't switch it back on, the reports close
		assertThat(post("/api/admin/listing-reports/" + used + "/hide", Map.of("note", " "), admin).status()).isEqualTo(400);
		assertThat(post("/api/admin/listing-reports/" + used + "/hide", Map.of("note", "Likely a scam"), admin).status())
				.isEqualTo(200);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(404);
		assertThat(post("/api/checkout", checkoutBody(used, 1, "0911223344")).status()).isEqualTo(409);
		Res again = patch("/api/seller/products/" + used + "/visibility", Map.of("active", true), seller);
		assertThat(again.status()).isEqualTo(409);
		assertThat(again.text("code")).isEqualTo("LISTING_BLOCKED");
		assertThat(get("/api/seller/products/" + used, seller).body().path("product").path("blockedReason").asString())
				.isEqualTo("Likely a scam");
		assertThat(get("/api/admin/listing-reports?status=OPEN", admin).raw()).doesNotContain("\"productId\":" + used + ",");

		// put back by staff
		assertThat(post("/api/admin/listing-reports/" + used + "/unblock", Map.of(), admin).status()).isEqualTo(200);
		assertThat(get("/api/products/" + slug).status()).isEqualTo(200);

		// dismiss leaves the listing alone
		post("/api/products/" + plain + "/report", Map.of("reason", "WRONG_INFO"), buyer);
		assertThat(post("/api/admin/listing-reports/" + plain + "/dismiss", Map.of(), admin).status()).isEqualTo(200);
		assertThat(get("/api/products/" + adminProduct(plain, admin).path("slug").asString()).status()).isEqualTo(200);
	}

	@Test
	void areasAreManagedByStaff() {
		assertThat(get("/api/areas").raw()).contains("Arada", "University area");
		String name = unique("Gebeya sefer");
		JsonNode list = post("/api/admin/areas", Map.of("name", name), admin).body();
		assertThat(list.toString()).contains(name);
		assertThat(post("/api/admin/areas", Map.of("name", name.toUpperCase()), admin).status()).isEqualTo(409);
		assertThat(get("/api/areas").raw()).contains(name);
		long id = 0;
		for (JsonNode a : list) {
			if (a.path("name").asString().equals(name)) {
				id = a.path("id").asLong();
			}
		}
		patch("/api/admin/areas/" + id, Map.of("active", false), admin);
		assertThat(get("/api/areas").raw()).doesNotContain(name);
		assertThat(post("/api/admin/areas", Map.of("name", "x"), customer("Not staff")).status()).isEqualTo(403);
	}
}
