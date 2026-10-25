package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
import et.tenapay.shop.telegram.LogTelegramGateway.Sent;
import et.tenapay.shop.telegram.TelegramService;

/** Telegram bot in test mode: linking by one-time code, alerts, commands, channel posts. */
class TelegramIntegrationTest extends IntegrationTest {

	@Autowired
	TelegramService telegram;

	@Autowired
	InboxService inbox;

	@Autowired
	JdbcTemplate jdbc;

	private Res update(long chatId, String text, String secret) {
		String body = """
				{"update_id": 1, "message": {"message_id": 5, "text": "%s",
				  "chat": {"id": %d, "type": "private"}, "from": {"id": %d, "username": "mekdes_t"}}}
				""".formatted(text, chatId, chatId);
		return postRaw("/api/telegram/webhook", body, Map.of("X-Telegram-Bot-Api-Secret-Token", secret));
	}

	private List<Sent> sentTo(String chatId) {
		return telegram.sentInTestMode().stream().filter(s -> s.chatId().equals(chatId)).toList();
	}

	private static long chatId() {
		return ThreadLocalRandom.current().nextLong(1_000_000, 9_000_000_000L);
	}

	@Test
	void linkByCodeThenAlertsArriveUntilStop() {
		String email = unique("tg") + "@it.test";
		String token = post("/api/auth/register", Map.of("fullName", "Mekdes T", "email", email, "phone",
				"09" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000)), "password", "Telegram-pass-2026"))
				.text("token");
		UUID userId = jdbc.queryForObject("select id from users where email = ?", UUID.class, email);
		long chat = chatId();

		assertThat(get("/api/me/telegram", token).body().path("linked").asBoolean()).isFalse();
		String code = post("/api/me/telegram/link", Map.of(), token).text("code");
		assertThat(code).hasSizeGreaterThan(10);

		// wrong or missing secret: nothing happens
		assertThat(update(chat, "/start " + code, "wrong").status()).isEqualTo(404);
		assertThat(sentTo(Long.toString(chat))).isEmpty();

		assertThat(update(chat, "/start " + code, TELEGRAM_SECRET).status()).isEqualTo(200);
		assertThat(sentTo(Long.toString(chat)).get(0).html()).contains("Linked");
		Res status = get("/api/me/telegram", token);
		assertThat(status.body().path("linked").asBoolean()).isTrue();
		assertThat(status.body().path("username").asString()).isEqualTo("mekdes_t");

		// a used code doesn't work again
		update(chatId(), "/start " + code, TELEGRAM_SECRET);
		assertThat(jdbc.queryForObject("select count(*) from telegram_links where user_id = ?", Long.class, userId)).isEqualTo(1);

		inbox.notify(userId, InboxItem.Kind.ORDER, "Payment received <SG-1>", "We're packing it.", "/orders/track?order=SG-1",
				"IT:TG:" + UUID.randomUUID());
		await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(sentTo(Long.toString(chat)).get(0).html())
				.isEqualTo("<b>Payment received &lt;SG-1&gt;</b>\nWe're packing it."));

		update(chat, "/stop", TELEGRAM_SECRET);
		assertThat(get("/api/me/telegram", token).body().path("linked").asBoolean()).isFalse();
		int before = sentTo(Long.toString(chat)).size();
		inbox.notify(userId, InboxItem.Kind.CHAT, "New message", null, "/chats/1", "IT:TG:" + UUID.randomUUID());
		await().during(Duration.ofSeconds(1)).atMost(Duration.ofSeconds(3))
				.untilAsserted(() -> assertThat(sentTo(Long.toString(chat))).hasSize(before));
	}

	@Test
	void newListingsArePostedToTheChannelOnceAndShownByNew() {
		String admin = adminToken();
		long productId = createProduct(admin, new BigDecimal("1250.00"), 3);
		String name = jdbc.queryForObject("select name from products where id = ?", String.class, productId);

		telegram.postNewListings();
		List<Sent> posts = sentTo("@sodo-test").stream().filter(s -> s.html().contains(name)).toList();
		assertThat(posts).hasSize(1);
		assertThat(posts.get(0).html()).contains("1,250.00 ETB");

		telegram.postNewListings();
		assertThat(sentTo("@sodo-test").stream().filter(s -> s.html().contains(name))).hasSize(1);

		long chat = chatId();
		update(chat, "/new", TELEGRAM_SECRET);
		assertThat(sentTo(Long.toString(chat)).get(0).html()).startsWith("<b>New on Sodo Gebeya</b>");

		assertThat(get("/api/admin/telegram", admin).body().path("configured").asBoolean()).isFalse();
	}
}
