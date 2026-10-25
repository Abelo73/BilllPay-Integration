package et.tenapay.shop.telegram;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.inbox.InboxItemAdded;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Telegram bot (Sodo Gebeya M20). People link their Telegram from the Notifications page (a one-time code in a
 * {@code t.me/<bot>?start=<code>} link); after that every in-app notification also arrives in Telegram. The bot answers
 * /new (latest listings), /stop (unlink) and /help. New listings are posted to the channel.
 */
@Slf4j
@Service
public class TelegramService {

	static final Duration CODE_TTL = Duration.ofMinutes(15);
	/** Only listings this new are posted to the channel, so switching the channel on doesn't post the whole catalog. */
	static final Duration CHANNEL_WINDOW = Duration.ofHours(24);

	private static final SecureRandom RANDOM = new SecureRandom();

	private final TelegramProperties props;
	private final AppProperties app;
	private final JdbcTemplate jdbc;
	private final ProductRepository products;
	private final TransactionTemplate tx;
	private final ExecutorService sender = Executors.newVirtualThreadPerTaskExecutor();
	private TelegramGateway gateway;

	public TelegramService(TelegramProperties props, AppProperties app, JdbcTemplate jdbc, ProductRepository products,
			TransactionTemplate tx, ObjectMapper json) {
		this.props = props;
		this.app = app;
		this.jdbc = jdbc;
		this.products = products;
		this.tx = tx;
		this.gateway = props.configured() ? new HttpTelegramGateway(props, json) : new LogTelegramGateway();
		log.info("Telegram: {}", gateway.delivers() ? "bot @" + props.botUsername() : "test mode (messages are logged, not sent)");
	}

	/** Lets tests replace the gateway without touching production wiring. */
	public interface TelegramGatewayOverride {
		TelegramGateway gateway();
	}

	@Autowired(required = false)
	void setGatewayOverride(TelegramGatewayOverride override) {
		if (override != null) {
			this.gateway = override.gateway();
		}
	}

	@PreDestroy
	void stop() {
		sender.shutdown();
	}

	// ---- linking ----

	/** {@code available} = a real bot is set up, so the "Connect Telegram" button can work. */
	public record LinkStatus(boolean available, boolean linked, String username) {
	}

	public record LinkStart(String code, String url, Instant expiresAt) {
	}

	public LinkStatus status(UUID userId) {
		List<String> names = jdbc.queryForList("select coalesce(username, '') from telegram_links where user_id = ?", String.class,
				userId);
		String username = names.isEmpty() || names.get(0).isEmpty() ? null : names.get(0);
		return new LinkStatus(props.configured() && hasBotName(), !names.isEmpty(), username);
	}

	/** A fresh one-time code; this person's older codes stop working. */
	public LinkStart startLink(UUID userId) {
		byte[] bytes = new byte[12];
		RANDOM.nextBytes(bytes);
		String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		Instant expires = Instant.now().plus(CODE_TTL);
		tx.executeWithoutResult(s -> {
			jdbc.update("delete from telegram_link_codes where user_id = ? or expires_at < now()", userId);
			jdbc.update("insert into telegram_link_codes (code, user_id, expires_at) values (?, ?, ?)", code, userId,
					Timestamp.from(expires));
		});
		String bot = hasBotName() ? props.botUsername() : "your_bot";
		return new LinkStart(code, "https://t.me/" + bot + "?start=" + code, expires);
	}

	public void unlink(UUID userId) {
		jdbc.update("delete from telegram_links where user_id = ?", userId);
	}

	public long linkedCount() {
		Long n = jdbc.queryForObject("select count(*) from telegram_links", Long.class);
		return n == null ? 0 : n;
	}

	// ---- incoming messages (webhook) ----

	/** Handles one Telegram update. Never throws: Telegram retries failed webhooks, and we don't want loops. */
	public void handleUpdate(JsonNode update) {
		try {
			JsonNode msg = update.path("message");
			if (msg.isMissingNode() || !"private".equals(msg.path("chat").path("type").asString(""))) {
				return; // groups and channels: ignore
			}
			long chatId = msg.path("chat").path("id").asLong(0);
			String text = msg.path("text").asString("").trim();
			String username = msg.path("from").path("username").asString(null);
			if (chatId == 0 || text.isEmpty()) {
				return;
			}
			String[] parts = text.split("\\s+", 2);
			String command = parts[0].toLowerCase().replaceAll("@.*$", "");
			String arg = parts.length > 1 ? parts[1].trim() : "";
			switch (command) {
				case "/start" -> start(chatId, arg, username);
				case "/new" -> latest(chatId);
				case "/stop" -> {
					int n = jdbc.update("delete from telegram_links where chat_id = ?", chatId);
					reply(chatId, n > 0 ? "Alerts are off. Link again any time from Notifications on the website."
							: "This chat isn't linked to an account.", null);
				}
				default -> reply(chatId, help(), siteButton("Open Sodo Gebeya", "/"));
			}
		} catch (RuntimeException e) {
			log.warn("Telegram update not handled: {}", e.getMessage());
		}
	}

	private void start(long chatId, String code, String username) {
		if (code.isEmpty()) {
			reply(chatId, "<b>Welcome to Sodo Gebeya!</b>\nTo get order, chat and job alerts here, open <b>Notifications</b> "
					+ "on the website and tap <b>Connect Telegram</b>.\n\n" + help(), siteButton("Open Notifications", "/notifications"));
			return;
		}
		UUID user = tx.execute(s -> {
			List<UUID> ids = jdbc.queryForList(
					"delete from telegram_link_codes where code = ? and expires_at > now() returning user_id", UUID.class, code);
			if (ids.isEmpty()) {
				return null;
			}
			UUID id = ids.get(0);
			jdbc.update("delete from telegram_links where chat_id = ? or user_id = ?", chatId, id);
			jdbc.update("insert into telegram_links (user_id, chat_id, username) values (?, ?, ?)", id, chatId, username);
			return id;
		});
		reply(chatId, user != null
				? "✅ <b>Linked.</b> You'll get your order, chat and job alerts here. Send /stop to turn them off."
				: "That link has expired. Open <b>Notifications</b> on the website and tap <b>Connect Telegram</b> again.", null);
	}

	private void latest(long chatId) {
		List<Listing> list = newest(5);
		if (list.isEmpty()) {
			reply(chatId, "No listings yet. Check back soon!", siteButton("Open Sodo Gebeya", "/"));
			return;
		}
		StringBuilder b = new StringBuilder("<b>New on Sodo Gebeya</b>\n");
		for (Listing p : list) {
			b.append("\n• <a href=\"").append(esc(siteUrl("/product/" + p.slug()))).append("\">").append(esc(p.name()))
					.append("</a> — ").append(money(p.price(), p.currency()));
		}
		reply(chatId, b.toString(), siteButton("See all", "/shop"));
	}

	private static String help() {
		return "/new: the newest listings\n/stop: turn alerts off\n/help: this list";
	}

	// ---- alerts ----

	/** Every new in-app notification also goes to the person's Telegram, once the notification is saved. */
	@TransactionalEventListener(fallbackExecution = true)
	public void onInboxItem(InboxItemAdded item) {
		try {
			List<Long> chats = jdbc.queryForList("select chat_id from telegram_links where user_id = ?", Long.class, item.userId());
			if (chats.isEmpty()) {
				return;
			}
			String body = item.body() == null || item.body().isBlank() ? "" : "\n" + esc(item.body());
			String html = "<b>" + esc(item.title()) + "</b>" + body;
			TelegramGateway.Button button = item.link() == null ? null : siteButton("Open", item.link());
			long chatId = chats.get(0);
			sender.submit(() -> reply(chatId, html, button));
		} catch (RuntimeException e) {
			log.warn("Telegram alert not sent: {}", e.getMessage());
		}
	}

	// ---- channel ----

	/** Posts listings from the last day that weren't posted yet. Returns how many were posted. */
	@Scheduled(fixedDelayString = "${telegram.channel-every:PT5M}", initialDelayString = "PT1M")
	public int postNewListings() {
		if (!props.channelConfigured()) {
			return 0;
		}
		Instant since = Instant.now().minus(CHANNEL_WINDOW);
		int posted = 0;
		for (Listing p : newest(20)) {
			if (p.createdAt() == null || p.createdAt().isBefore(since)) {
				continue;
			}
			int claimed = jdbc.update("insert into telegram_channel_posts (product_id) values (?) on conflict do nothing", p.id());
			if (claimed == 0) {
				continue;
			}
			String html = "🆕 <b>" + esc(p.name()) + "</b>\n" + money(p.price(), p.currency())
					+ (p.shopName() != null ? "\n🏪 " + esc(p.shopName()) : "");
			TelegramGateway.Result r = gateway.sendMessage(props.channelId(), html, siteButton("View", "/product/" + p.slug()));
			if (!r.ok()) {
				jdbc.update("delete from telegram_channel_posts where product_id = ?", p.id()); // try again next round
				break;
			}
			posted++;
		}
		return posted;
	}

	// ---- admin ----

	public record AdminStatus(boolean configured, String botUsername, String channelId, boolean webhookSecretSet,
			String webhookUrl, long linkedUsers, List<LogTelegramGateway.Sent> recent) {
	}

	public AdminStatus adminStatus() {
		return new AdminStatus(props.configured(), props.botUsername(), props.channelId(), notBlank(props.webhookSecret()),
				webhookUrl(), linkedCount(), sentInTestMode().stream().limit(20).toList());
	}

	public TelegramGateway.Result registerWebhook() {
		if (!notBlank(props.webhookSecret())) {
			return TelegramGateway.Result.failed("Set TELEGRAM_WEBHOOK_SECRET in .env first.");
		}
		String url = webhookUrl();
		if (!url.startsWith("https://")) {
			return TelegramGateway.Result.failed("Telegram needs an https address. Set APP_REDIRECT_BASE_URL to the ngrok URL.");
		}
		return gateway.setWebhook(url, props.webhookSecret());
	}

	public boolean webhookSecretMatches(String header) {
		return notBlank(props.webhookSecret()) && header != null && MessageDigest.isEqual(
				header.getBytes(StandardCharsets.UTF_8), props.webhookSecret().getBytes(StandardCharsets.UTF_8));
	}

	/** Test mode only: the messages the bot would have sent, newest first. */
	public List<LogTelegramGateway.Sent> sentInTestMode() {
		return gateway instanceof LogTelegramGateway l ? l.sent() : List.of();
	}

	// ---- helpers ----

	record Listing(long id, String slug, String name, BigDecimal price, String currency, String shopName, Instant createdAt) {
	}

	/** Newest products the store shows (same rules as the shop page). */
	private List<Listing> newest(int n) {
		return tx.execute(s -> products.search(null, null, null, PageRequest.of(0, n, Sort.by(Sort.Direction.DESC, "createdAt", "id")))
				.getContent().stream().map(TelegramService::listing).toList());
	}

	private static Listing listing(Product p) {
		return new Listing(p.getId(), p.getSlug(), p.getName(), p.getPrice(), p.getCurrency(),
				p.getShop() == null ? null : p.getShop().getName(), p.getCreatedAt());
	}

	private void reply(long chatId, String html, TelegramGateway.Button button) {
		gateway.sendMessage(Long.toString(chatId), html, button);
	}

	private String webhookUrl() {
		String base = notBlank(app.redirectBaseUrl()) ? app.redirectBaseUrl() : app.publicBaseUrl();
		return (base == null ? "" : base.replaceAll("/+$", "")) + "/api/telegram/webhook";
	}

	private String siteUrl(String path) {
		String base = app.publicBaseUrl() == null ? "" : app.publicBaseUrl().replaceAll("/+$", "");
		return base + path;
	}

	/** Telegram rejects buttons that don't point to a public https site, so local links go without one. */
	private TelegramGateway.Button siteButton(String text, String path) {
		String url = siteUrl(path);
		return url.startsWith("https://") ? new TelegramGateway.Button(text, url) : null;
	}

	private boolean hasBotName() {
		return notBlank(props.botUsername());
	}

	private static boolean notBlank(String s) {
		return s != null && !s.isBlank();
	}

	static String esc(String s) {
		return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

	private static String money(BigDecimal amount, String currency) {
		if (amount == null) {
			return "";
		}
		return String.format("%,.2f %s", amount.setScale(2, RoundingMode.HALF_UP), currency == null ? "ETB" : currency);
	}
}
