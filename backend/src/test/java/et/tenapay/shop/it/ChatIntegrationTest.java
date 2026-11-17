package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;

/** Buyer ↔ shop chat: messages, unread counts, offers, safety flags, block and report. */
class ChatIntegrationTest extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private String admin;
	private long categoryId;

	@BeforeEach
	void setUp() {
		admin = adminToken();
		JsonNode cats = post("/api/admin/categories", Map.of("name", unique("Chat Cat")), admin).body();
		categoryId = cats.get(cats.size() - 1).path("id").asLong();
	}

	private String customer(String name, String phone) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("chat") + "@it.test", "phone", phone,
				"password", "Chat-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("token");
	}

	private record Seller(String token, long shopId, long productId, String shopName) {
	}

	/** A customer with an approved shop and one 2,450 ETB product. */
	private Seller seller(String shopPhone) {
		String token = customer("Marta Seller", "0911000000");
		String name = unique("Marta Boutique");
		Res shop = post("/api/seller/shop", Map.of("kind", "SHOP", "name", name, "phone", shopPhone, "area", "Arada",
				"description", "Shoes"), token);
		assertThat(shop.status()).as(shop.raw()).isEqualTo(200);
		long shopId = shop.body().path("id").asLong();
		Map<String, Object> product = new LinkedHashMap<>();
		product.put("name", unique("Leather shoes"));
		product.put("categoryId", categoryId);
		product.put("price", new BigDecimal("2450.00"));
		product.put("stock", 5);
		product.put("lowStockThreshold", 1);
		product.put("active", true);
		Res p = post("/api/seller/products", product, token);
		assertThat(p.status()).as(p.raw()).isEqualTo(200);
		Res ok = post("/api/admin/shops/" + shopId + "/decision", Map.of("status", "APPROVED"), admin);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		return new Seller(token, shopId, p.body().path("product").path("id").asLong(), name);
	}

	private long start(String buyer, long productId, String text) {
		Res r = post("/api/chats", text == null ? Map.of("productId", productId) : Map.of("productId", productId, "text", text), buyer);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("id").asLong();
	}

	private JsonNode thread(String token, long id) {
		Res r = get("/api/chats/" + id, token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body();
	}

	private long unread(String token) {
		return get("/api/chats/unread", token).body().path("unread").asLong();
	}

	@Test
	void buyerAndSellerTalkWithUnreadCounts() {
		Seller s = seller("0912000001");
		String buyer = customer("Hana Buyer", "0922000001");

		long id = start(buyer, s.productId(), "Hello, do you have size 43?");
		JsonNode buyerView = thread(buyer, id).path("conversation");
		assertThat(buyerView.path("side").asString()).isEqualTo("BUYER");
		assertThat(buyerView.path("otherName").asString()).isEqualTo(s.shopName());
		assertThat(buyerView.path("product").path("id").asLong()).isEqualTo(s.productId());

		assertThat(unread(s.token())).isEqualTo(1);
		JsonNode list = get("/api/chats?filter=selling", s.token()).body().path("content");
		assertThat(list.get(0).path("side").asString()).isEqualTo("SELLER");
		assertThat(list.get(0).path("otherName").asString()).isEqualTo("Hana Buyer");
		assertThat(list.get(0).path("unread").asBoolean()).isTrue();

		JsonNode sellerThread = thread(s.token(), id);
		assertThat(sellerThread.path("messages").get(0).path("body").asString()).isEqualTo("Hello, do you have size 43?");
		assertThat(sellerThread.path("messages").get(0).path("mine").asBoolean()).isFalse();
		assertThat(unread(s.token())).isZero();

		long lastId = sellerThread.path("messages").get(0).path("id").asLong();
		Res reply = post("/api/chats/" + id + "/messages", Map.of("text", "Yes, size 43 is in stock."), s.token());
		assertThat(reply.status()).as(reply.raw()).isEqualTo(200);
		assertThat(unread(buyer)).isEqualTo(1);
		JsonNode newer = get("/api/chats/" + id + "?after=" + lastId, buyer).body().path("messages");
		assertThat(newer).hasSize(1);
		assertThat(newer.get(0).path("senderRole").asString()).isEqualTo("SELLER");

		// starting again reuses the same conversation
		assertThat(start(buyer, s.productId(), null)).isEqualTo(id);
	}

	@Test
	void offersCounterAndAccept() {
		Seller s = seller("0912000002");
		String buyer = customer("Dawit Buyer", "0922000002");
		long id = start(buyer, s.productId(), null);

		Res tooHigh = post("/api/chats/" + id + "/offers", Map.of("unitPrice", 3000), buyer);
		assertThat(tooHigh.status()).isEqualTo(400);
		assertThat(tooHigh.text("code")).isEqualTo("BAD_PRICE");

		JsonNode first = post("/api/chats/" + id + "/offers", Map.of("unitPrice", 2200), buyer).body().path("offer");
		assertThat(first.path("status").asString()).isEqualTo("PENDING");
		assertThat(first.path("mine").asBoolean()).isTrue();
		long firstId = first.path("id").asLong();
		Res own = post("/api/chats/offers/" + firstId + "/accept", Map.of(), buyer);
		assertThat(own.status()).isEqualTo(403);
		assertThat(own.text("code")).isEqualTo("NOT_YOUR_TURN");

		long counter = post("/api/chats/" + id + "/offers", Map.of("unitPrice", 2300), s.token()).body().path("offer").path("id").asLong();
		JsonNode accepted = post("/api/chats/offers/" + counter + "/accept", Map.of(), buyer).body();
		assertThat(accepted.path("status").asString()).isEqualTo("ACCEPTED");
		assertThat(accepted.path("canBuy").asBoolean()).isTrue();
		assertThat(accepted.path("total").decimalValue()).isEqualByComparingTo("2300");

		JsonNode messages = thread(buyer, id).path("messages");
		assertThat(messages.findValuesAsString("kind")).containsSubsequence("OFFER", "OFFER", "SYSTEM");
		assertThat(messages.get(0).path("offer").path("status").asString()).isEqualTo("COUNTERED");
		assertThat(messages.get(messages.size() - 1).path("body").asString()).contains("Offer accepted: 2300 ETB");
		assertThat(post("/api/chats/offers/" + counter + "/decline", Map.of(), buyer).text("code")).isEqualTo("OFFER_CLOSED");
	}

	@Test
	void safetyFlagsPrivacyBlockAndReport() {
		Seller s = seller("0912000003");
		String buyer = customer("Selam Buyer", "0922000003");
		String stranger = customer("Stranger", "0922000004");
		long id = start(buyer, s.productId(), null);

		JsonNode flagged = post("/api/chats/" + id + "/messages", Map.of("text", "Call me 0911 234 567 and send money first"), s.token()).body();
		assertThat(flagged.path("flagged").asBoolean()).isTrue();
		assertThat(post("/api/chats/" + id + "/messages", Map.of("text", "Is it leather?"), buyer).body().path("flagged").asBoolean()).isFalse();

		assertThat(get("/api/chats/" + id, stranger).status()).isEqualTo(404);
		assertThat(post("/api/chats", Map.of("productId", s.productId()), s.token()).text("code")).isEqualTo("OWN_SHOP");
		assertThat(get("/api/chats/" + id, admin).status()).isEqualTo(403); // staff can't browse chats

		post("/api/chats/" + id + "/block", Map.of("blocked", true), buyer);
		Res blocked = post("/api/chats/" + id + "/messages", Map.of("text", "hello?"), s.token());
		assertThat(blocked.status()).isEqualTo(403);
		assertThat(blocked.text("code")).isEqualTo("CHAT_BLOCKED");
		assertThat(thread(s.token(), id).path("canWrite").asBoolean()).isFalse();

		post("/api/chats/" + id + "/report", Map.of("reason", "OFF_PLATFORM_PAYMENT", "details", "Asked me to pay by phone"), buyer);
		JsonNode reports = get("/api/admin/chat-reports?status=OPEN", admin).body().path("content");
		JsonNode report = null;
		for (JsonNode r : reports) {
			if (r.path("conversationId").asLong() == id) {
				report = r;
			}
		}
		assertThat(report).isNotNull();
		assertThat(report.path("reporterSide").asString()).isEqualTo("BUYER");
		long reportId = report.path("id").asLong();
		JsonNode detail = get("/api/admin/chat-reports/" + reportId, admin).body();
		assertThat(detail.path("thread").path("messages").findValuesAsString("body")).contains("Call me 0911 234 567 and send money first");

		JsonNode resolved = post("/api/admin/chat-reports/" + reportId + "/resolve", Map.of("resolution", "Seller warned", "blockConversation", true), admin).body();
		assertThat(resolved.path("status").asString()).isEqualTo("RESOLVED");
	}

	@Test
	void theOtherSideGetsOneSmsNudgeNotOnePerMessage() {
		Seller s = seller("0912000005");
		String buyer = customer("Abel Buyer", "0922000005");
		long id = start(buyer, s.productId(), "First");
		post("/api/chats/" + id + "/messages", Map.of("text", "Second"), buyer);
		post("/api/chats/" + id + "/messages", Map.of("text", "Third"), buyer);
		await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(jdbc.queryForObject(
				"select count(*) from sms_messages where kind = 'CHAT' and recipient = '+251912000005'", Long.class)).isEqualTo(1));
		String body = jdbc.queryForObject("select body from sms_messages where kind = 'CHAT' and recipient = '+251912000005'", String.class);
		assertThat(body).contains("new message from Abel Buyer").contains("/chats/" + id).hasSizeLessThanOrEqualTo(160);
	}

	@Test
	void typingOnlineAndSeenShowToTheOtherSideOnly() {
		Seller s = seller("0912000020");
		String buyer = customer("Mekdes Buyer", "0922000020");
		String stranger = customer("Nobody Here", "0922000021");
		long id = start(buyer, s.productId(), "Is this still available?");

		// the seller has not opened the chat yet: the buyer sees no read time
		assertThat(thread(buyer, id).path("other").path("readAt").isNull()).isTrue();

		// the buyer types: the seller sees it and sees the buyer online; the buyer does not see their own typing
		assertThat(post("/api/chats/" + id + "/typing", Map.of(), buyer).status()).isEqualTo(200);
		JsonNode sellerView = thread(s.token(), id);
		assertThat(sellerView.path("other").path("typing").asBoolean()).isTrue();
		assertThat(sellerView.path("other").path("online").asBoolean()).isTrue();
		assertThat(thread(buyer, id).path("other").path("typing").asBoolean()).isFalse();

		// the seller has opened it: the buyer now sees a read time, which is the "Seen" tick
		assertThat(thread(buyer, id).path("other").path("readAt").isNull()).isFalse();

		// a stranger can neither type in it nor learn anything from it
		assertThat(post("/api/chats/" + id + "/typing", Map.of(), stranger).status()).isEqualTo(404);
		assertThat(post("/api/chats/presence", Map.of(), stranger).status()).isEqualTo(200);
	}

	/** Waits for an event of this name on a stream read in the background. */
	private static boolean sawEvent(BlockingQueue<String> lines, String name) throws InterruptedException {
		long until = System.currentTimeMillis() + 10_000;
		while (System.currentTimeMillis() < until) {
			String line = lines.poll(300, TimeUnit.MILLISECONDS);
			if (line != null && line.startsWith("event:") && line.substring(6).trim().equals(name)) {
				return true;
			}
		}
		return false;
	}

	@Test
	void liveStreamTellsTheOtherSideWhenSomethingHappens() throws Exception {
		Seller s = seller("0912000030");
		String buyer = customer("Lili Buyer", "0922000030");

		// signed out: no stream
		assertThat(get("/api/live/stream").status()).isEqualTo(401);

		// the seller opens the live stream with their sign-in
		HttpResponse<InputStream> stream = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(baseUrl() + "/api/live/stream"))
				.header("Authorization", "Bearer " + s.token()).header("Accept", "text/event-stream").build(),
				HttpResponse.BodyHandlers.ofInputStream());
		assertThat(stream.statusCode()).isEqualTo(200);
		BlockingQueue<String> lines = new LinkedBlockingQueue<>();
		Thread reader = Thread.ofVirtual().start(() -> {
			try (BufferedReader r = new BufferedReader(new InputStreamReader(stream.body(), StandardCharsets.UTF_8))) {
				String line;
				while ((line = r.readLine()) != null) {
					lines.add(line);
				}
			} catch (IOException closed) {
				// the test closed the stream
			}
		});
		try {
			// a new message from the buyer reaches the seller's stream
			long id = start(buyer, s.productId(), "Is this still available?");
			assertThat(sawEvent(lines, "chat")).isTrue();

			// typing reaches the seller's stream too
			assertThat(post("/api/chats/" + id + "/typing", Map.of(), buyer).status()).isEqualTo(200);
			assertThat(sawEvent(lines, "typing")).isTrue();
		} finally {
			stream.body().close();
			reader.join(2000);
		}
	}

	@Test
	void repliesQuoteAMessageFromTheSameChatOnly() {
		Seller s = seller("0912000040");
		String buyer = customer("Rahel Buyer", "0922000040");
		long id = start(buyer, s.productId(), "Do you deliver?");
		long question = thread(buyer, id).path("messages").get(0).path("id").asLong();

		Res reply = post("/api/chats/" + id + "/messages", Map.of("text", "Yes, across Sodo.", "replyToId", question), s.token());
		assertThat(reply.status()).as(reply.raw()).isEqualTo(200);
		JsonNode msgs = thread(s.token(), id).path("messages");
		JsonNode last = msgs.get(msgs.size() - 1);
		assertThat(last.path("replyTo").path("id").asLong()).isEqualTo(question);
		assertThat(last.path("replyTo").path("text").asString()).isEqualTo("Do you deliver?");
		assertThat(last.path("replyTo").path("mine").asBoolean()).isFalse();

		// a reply to a message that is not in this chat is refused
		assertThat(post("/api/chats/" + id + "/messages", Map.of("text", "Hi", "replyToId", 999999999L), s.token()).status()).isEqualTo(400);
	}

	@Test
	void voiceMessagesAreStoredPlayableAndChecked() {
		Seller s = seller("0912000041");
		String buyer = customer("Yonas Buyer", "0922000041");
		long id = start(buyer, s.productId(), null);
		byte[] audio = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, 1, 2, 3};

		Res ok = upload("/api/chats/" + id + "/voice?seconds=4", "voice.webm", "audio/webm", audio, buyer);
		assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		assertThat(ok.body().path("kind").asString()).isEqualTo("AUDIO");
		assertThat(ok.body().path("audioSeconds").asInt()).isEqualTo(4);
		String url = ok.body().path("audioUrl").asString();
		assertThat(url).contains("/api/media/chat/");
		assertThat(getBytes(url).statusCode()).isEqualTo(200);

		// the wrong kind of file, or too long, is refused
		assertThat(upload("/api/chats/" + id + "/voice?seconds=4", "x.txt", "text/plain", audio, buyer).status()).isEqualTo(400);
		assertThat(upload("/api/chats/" + id + "/voice?seconds=500", "voice.webm", "audio/webm", audio, buyer).status()).isEqualTo(400);

		// a stranger cannot send into this chat
		String stranger = customer("Nobody Voice", "0922000042");
		assertThat(upload("/api/chats/" + id + "/voice?seconds=4", "voice.webm", "audio/webm", audio, stranger).status()).isEqualTo(404);
	}

	@Test
	void contactShowsTheShopToTheBuyerAndOnlyWhatIsSharedOfTheBuyer() {
		Seller s = seller("0912000050");
		String buyer = customer("Sara Buyer", "0922000050");
		String stranger = customer("Nobody Contact", "0922000051");
		long id = start(buyer, s.productId(), "Hi");

		// the buyer sees the shop's public details
		JsonNode shop = get("/api/chats/" + id + "/contact", buyer).body();
		assertThat(shop.path("kind").asString()).isEqualTo("SHOP");
		assertThat(shop.path("name").asString()).isEqualTo(s.shopName());
		assertThat(shop.path("shopSlug").asString()).isNotBlank();

		// the seller sees the buyer's name, and no bio or profile link while the buyer's profile is private
		JsonNode person = get("/api/chats/" + id + "/contact", s.token()).body();
		assertThat(person.path("kind").asString()).isEqualTo("PERSON");
		assertThat(person.path("personId").isNull()).isTrue();
		assertThat(person.path("bio").isNull()).isTrue();

		// a stranger learns nothing about the conversation
		assertThat(get("/api/chats/" + id + "/contact", stranger).status()).isEqualTo(404);
	}
}
