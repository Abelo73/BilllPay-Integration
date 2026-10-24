package et.tenapay.shop.chat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.extern.slf4j.Slf4j;

/**
 * Buyer ↔ shop chat (design S11/S12): text and photos, offers that let the buyer check out at an agreed price, a safety
 * flag on messages that look like an attempt to deal outside the platform, report and block. Staff can read a
 * conversation only after someone reported it.
 */
@Slf4j
@Service
public class ChatService {

	public static final int MAX_MESSAGES_PER_MINUTE = 30;
	public static final Duration OFFER_TTL = Duration.ofHours(48);
	public static final Duration SMS_NUDGE_EVERY = Duration.ofHours(6);

	/** Phone numbers and "pay me outside" phrases (English and Amharic). */
	private static final Pattern OFF_PLATFORM = Pattern.compile(
			"(\\+?251|\\b0)[\\s-]?[79](?:[\\s-]?\\d){8}"
					+ "|send (the )?money|transfer (the )?money|money transfer|telebirr|cbe ?birr|m-?pesa|bank account|account number"
					+ "|pay (me )?(first|before|directly|outside|in advance)|advance payment|deposit first|outside (the app|sodo)"
					+ "|ብር ላክ|ቴሌብር|አካውንት|በቅድሚያ ክፈል",
			Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

	private final ConversationRepository conversations;
	private final ChatMessageRepository messages;
	private final ChatOfferRepository offers;
	private final ChatReportRepository reports;
	private final ShopRepository shops;
	private final ProductRepository products;
	private final UserRepository users;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final MediaProperties media;
	private final SmsService sms;
	private final AppProperties app;
	private final TransactionTemplate tx;
	private final et.tenapay.shop.inbox.InboxService inbox;

	public ChatService(ConversationRepository conversations, ChatMessageRepository messages, ChatOfferRepository offers,
			ChatReportRepository reports, ShopRepository shops, ProductRepository products, UserRepository users,
			ImageProcessor images, MediaStorage storage, MediaProperties media, SmsService sms, AppProperties app,
			TransactionTemplate tx, et.tenapay.shop.inbox.InboxService inbox) {
		this.conversations = conversations;
		this.messages = messages;
		this.offers = offers;
		this.reports = reports;
		this.shops = shops;
		this.products = products;
		this.users = users;
		this.images = images;
		this.storage = storage;
		this.media = media;
		this.sms = sms;
		this.app = app;
		this.tx = tx;
		this.inbox = inbox;
	}

	// ---------- views ----------

	public record ProductCard(Long id, String name, String slug, BigDecimal price, String imageUrl, boolean available) {
	}

	public record OfferView(Long id, Long productId, String productName, int quantity, BigDecimal unitPrice, BigDecimal total,
			String madeBy, boolean mine, String status, Instant expiresAt, boolean canAnswer, boolean canWithdraw, boolean canBuy) {
	}

	public record MessageView(Long id, String senderRole, boolean mine, String kind, String body, String imageUrl,
			OfferView offer, boolean flagged, Instant createdAt) {
	}

	/** One row in the chat list; {@code side} is the viewer's side (BUYER or SELLER). */
	public record ConversationView(Long id, String side, String otherName, String shopName, String shopSlug,
			ProductCard product, String lastMessagePreview, Instant lastMessageAt, boolean unread, String blockedBy) {
	}

	public record Thread(ConversationView conversation, List<MessageView> messages, boolean canWrite) {
	}

	private record Party(Conversation c, Conversation.Side side, Shop shop) {
	}

	// ---------- start and list ----------

	/** Opens (or reopens) the buyer's conversation with the product's shop and points it at that product. */
	public ConversationView start(UUID buyerId, Long productId, String firstMessage) {
		Long shopId = tx.execute(s -> {
			Product product = products.findById(productId).orElseThrow(() -> ApiException.notFound("Product"));
			Shop shop = product.getShop();
			if (shop == null || shop.getStatus() == null || !shop.getStatus().selling() || !product.isActive()) {
				throw new ApiException(HttpStatus.CONFLICT, "CHAT_UNAVAILABLE", "You can't chat about this item.");
			}
			if (shop.getOwnerId().equals(buyerId)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "OWN_SHOP", "This is your own shop.");
			}
			return shop.getId();
		});
		Conversation c;
		try {
			c = tx.execute(s -> {
				Conversation conv = conversations.findByBuyerIdAndShopId(buyerId, shopId).orElseGet(() -> {
					Conversation n = new Conversation();
					n.setBuyerId(buyerId);
					n.setShopId(shopId);
					return n;
				});
				conv.setProductId(productId);
				return conversations.saveAndFlush(conv);
			});
		} catch (DataIntegrityViolationException race) {
			c = conversations.findByBuyerIdAndShopId(buyerId, shopId).orElseThrow();
		}
		if (firstMessage != null && !firstMessage.isBlank()) {
			sendText(buyerId, c.getId(), firstMessage);
		}
		Long id = c.getId();
		return tx.execute(s -> view(party(buyerId, id), buyerId));
	}

	public PageDto<ConversationView> list(UUID userId, String filter, int page, int size) {
		Shop own = shops.findByOwnerId(userId).orElse(null);
		boolean asBuyer = !"selling".equals(filter);
		Long shopId = own == null || "buying".equals(filter) ? null : own.getId();
		return tx.execute(s -> PageDto.of(conversations.forUser(userId, asBuyer, shopId, PageRequest.of(page, Math.min(size, 50)))
				.map(c -> view(new Party(c, c.getBuyerId().equals(userId) ? Conversation.Side.BUYER : Conversation.Side.SELLER,
						shops.findById(c.getShopId()).orElse(null)), userId))));
	}

	public long unreadCount(UUID userId) {
		Long shopId = shops.findByOwnerId(userId).map(Shop::getId).orElse(null);
		return conversations.countUnread(userId, shopId);
	}

	/** Messages after {@code afterId} (0 = the latest 50), and marks the conversation read. */
	public Thread thread(UUID userId, Long conversationId, long afterId) {
		return tx.execute(s -> {
			Party p = party(userId, conversationId);
			List<ChatMessage> list = afterId > 0 ? messages.after(conversationId, afterId, PageRequest.of(0, 200))
					: messages.latest(conversationId, PageRequest.of(0, 50)).reversed();
			p.c().markRead(p.side(), Instant.now());
			return new Thread(view(p, userId), messageViews(list, userId, p), p.c().getBlockedBy() == null);
		});
	}

	// ---------- writing ----------

	public MessageView sendText(UUID userId, Long conversationId, String text) {
		String body = text == null ? "" : text.strip();
		if (body.isEmpty() || body.length() > 2000) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_MESSAGE", "Write a message of up to 2000 characters.");
		}
		return post(userId, conversationId, ChatMessage.Kind.TEXT, body, null, null);
	}

	public MessageView sendImage(UUID userId, Long conversationId, byte[] upload) {
		party(userId, conversationId); // check access before doing any work
		ImageProcessor.Processed img = images.process(upload);
		String key = "chat/" + conversationId + "/" + UUID.randomUUID() + "-l.jpg";
		storage.put(key, img.large(), "image/jpeg");
		return post(userId, conversationId, ChatMessage.Kind.IMAGE, null, key, null);
	}

	private MessageView post(UUID userId, Long conversationId, ChatMessage.Kind kind, String body, String imageKey, Long offerId) {
		if (messages.countBySenderIdAndCreatedAtAfter(userId, Instant.now().minusSeconds(60)) >= MAX_MESSAGES_PER_MINUTE) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "SLOW_DOWN", "You're sending messages too fast. Wait a moment.");
		}
		record Saved(MessageView view, Party party, String preview) {
		}
		Saved saved = tx.execute(s -> {
			Party p = lockedParty(userId, conversationId);
			if (p.c().getBlockedBy() != null) {
				throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_BLOCKED", "This conversation is blocked.");
			}
			ChatMessage m = new ChatMessage();
			m.setConversationId(conversationId);
			m.setSenderId(userId);
			m.setSenderRole(p.side() == Conversation.Side.BUYER ? ChatMessage.SenderRole.BUYER : ChatMessage.SenderRole.SELLER);
			m.setKind(kind);
			m.setBody(body);
			m.setImageKey(imageKey);
			m.setOfferId(offerId);
			m.setFlagged(body != null && OFF_PLATFORM.matcher(body).find());
			messages.save(m);
			String preview = switch (kind) {
				case IMAGE -> "Photo";
				case OFFER -> "Offer";
				default -> body.length() > 150 ? body.substring(0, 150) + "…" : body;
			};
			p.c().setLastMessageAt(m.getCreatedAt());
			p.c().setLastMessagePreview(preview);
			p.c().markRead(p.side(), m.getCreatedAt());
			return new Saved(messageViews(List.of(m), userId, p).getFirst(), p, preview);
		});
		notifyInbox(saved.party(), userId, saved.preview());
		nudgeBySms(saved.party(), userId);
		return saved.view();
	}

	// ---------- offers ----------

	/** A price for the conversation's product (or {@code productId}, which must be from the same shop). */
	public MessageView makeOffer(UUID userId, Long conversationId, Long productId, BigDecimal unitPrice, int quantity) {
		if (quantity < 1 || quantity > 20) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_QUANTITY", "Quantity must be between 1 and 20.");
		}
		Long offerId = tx.execute(s -> {
			Party p = lockedParty(userId, conversationId);
			Long pid = productId != null ? productId : p.c().getProductId();
			Product product = pid == null ? null : products.findById(pid).orElse(null);
			if (product == null || product.getShop() == null || !product.getShop().getId().equals(p.c().getShopId())) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_PRODUCT", "Pick an item from this shop.");
			}
			BigDecimal price = unitPrice == null ? null : unitPrice.setScale(2, java.math.RoundingMode.HALF_UP);
			if (price == null || price.signum() <= 0 || price.compareTo(product.getPrice()) > 0) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_PRICE",
						"An offer must be more than 0 and at most the listed price (" + product.getPrice() + " ETB).");
			}
			Instant now = Instant.now();
			for (ChatOffer open : offers.findByConversationIdAndStatus(conversationId, ChatOffer.Status.PENDING)) {
				open.setStatus(open.getMadeBy() == p.side() ? ChatOffer.Status.WITHDRAWN : ChatOffer.Status.COUNTERED);
				open.setDecidedAt(now);
			}
			ChatOffer o = new ChatOffer();
			o.setConversationId(conversationId);
			o.setProductId(pid);
			o.setQuantity(quantity);
			o.setUnitPrice(price);
			o.setMadeBy(p.side());
			o.setExpiresAt(now.plus(OFFER_TTL));
			p.c().setProductId(pid);
			return offers.save(o).getId();
		});
		return post(userId, conversationId, ChatMessage.Kind.OFFER, null, null, offerId);
	}

	public enum OfferAction { ACCEPT, DECLINE, WITHDRAW }

	public OfferView answerOffer(UUID userId, Long offerId, OfferAction action) {
		record Done(Long conversationId, String note) {
		}
		Done done = tx.execute(s -> {
			ChatOffer o = offers.lockById(offerId).orElseThrow(() -> ApiException.notFound("Offer"));
			Party p = party(userId, o.getConversationId());
			Instant now = Instant.now();
			if (!o.isOpen(now)) {
				throw new ApiException(HttpStatus.CONFLICT, "OFFER_CLOSED", "This offer is no longer open.");
			}
			boolean mine = o.getMadeBy() == p.side();
			if (action == OfferAction.WITHDRAW ? !mine : mine) {
				throw new ApiException(HttpStatus.FORBIDDEN, "NOT_YOUR_TURN",
						mine ? "Wait for the other side to answer your offer." : "Only who made the offer can withdraw it.");
			}
			o.setDecidedAt(now);
			String price = o.getUnitPrice().stripTrailingZeros().toPlainString() + " ETB";
			String note = switch (action) {
				case ACCEPT -> {
					o.setStatus(ChatOffer.Status.ACCEPTED);
					o.setExpiresAt(now.plus(OFFER_TTL)); // time to buy at that price
					yield "Offer accepted: " + price + (o.getQuantity() > 1 ? " each × " + o.getQuantity() : "")
							+ ". The buyer can check out at this price for 48 hours.";
				}
				case DECLINE -> {
					o.setStatus(ChatOffer.Status.DECLINED);
					yield "Offer of " + price + " declined.";
				}
				case WITHDRAW -> {
					o.setStatus(ChatOffer.Status.WITHDRAWN);
					yield "Offer of " + price + " withdrawn.";
				}
			};
			return new Done(o.getConversationId(), note);
		});
		systemNote(done.conversationId(), done.note());
		return tx.execute(s -> {
			Party p = party(userId, done.conversationId());
			return offerViews(List.of(offers.findById(offerId).orElseThrow()), userId, p).get(offerId);
		});
	}

	/**
	 * For checkout: the agreed unit price when {@code offerId} is an accepted, unexpired offer of this buyer for this
	 * product and quantity; throws otherwise.
	 */
	public BigDecimal agreedPrice(UUID buyerId, Long offerId, Long productId, int quantity) {
		ChatOffer o = offers.findById(offerId).orElseThrow(() -> ApiException.notFound("Offer"));
		Conversation c = conversations.findById(o.getConversationId()).orElseThrow();
		if (!c.getBuyerId().equals(buyerId) || !o.getProductId().equals(productId) || o.getQuantity() != quantity
				|| !o.isBuyable(Instant.now())) {
			throw new ApiException(HttpStatus.CONFLICT, "OFFER_NOT_USABLE",
					"That agreed price can't be used (expired, already used, or for a different item or quantity).");
		}
		return o.getUnitPrice();
	}

	/** Marks an accepted offer as bought by an order (call inside the checkout transaction). */
	public void markOfferUsed(Long offerId, String orderNumber) {
		ChatOffer o = offers.lockById(offerId).orElseThrow();
		if (o.getStatus() != ChatOffer.Status.ACCEPTED) {
			throw new ApiException(HttpStatus.CONFLICT, "OFFER_NOT_USABLE", "That agreed price was already used.");
		}
		o.setStatus(ChatOffer.Status.USED);
		o.setUsedOrderNumber(orderNumber);
	}

	// ---------- safety ----------

	public void block(UUID userId, Long conversationId, boolean blocked) {
		tx.executeWithoutResult(s -> {
			Party p = lockedParty(userId, conversationId);
			if (blocked) {
				if (p.c().getBlockedBy() == null) {
					p.c().setBlockedBy(p.side());
				}
			} else if (p.c().getBlockedBy() == p.side()) {
				p.c().setBlockedBy(null);
			}
		});
	}

	public void report(UUID userId, Long conversationId, ChatReport.Reason reason, String details) {
		tx.executeWithoutResult(s -> {
			party(userId, conversationId);
			if (reports.existsByConversationIdAndReporterIdAndStatus(conversationId, userId, ChatReport.Status.OPEN)) {
				return; // already reported and waiting for staff
			}
			ChatReport r = new ChatReport();
			r.setConversationId(conversationId);
			r.setReporterId(userId);
			r.setReason(reason == null ? ChatReport.Reason.OTHER : reason);
			r.setDetails(details == null || details.isBlank() ? null : details.strip().substring(0, Math.min(500, details.strip().length())));
			reports.save(r);
		});
		log.info("Chat {} reported by {} ({})", conversationId, userId, reason);
	}

	// ---------- staff (reported conversations only) ----------

	public record ReportView(Long id, Long conversationId, String reason, String details, String status, String resolution,
			String resolvedBy, Instant resolvedAt, Instant createdAt, String buyerName, String shopName, String reporterSide) {
	}

	public PageDto<ReportView> reports(String status, int page) {
		var pr = PageRequest.of(page, 20);
		return tx.execute(s -> PageDto.of((status == null || status.isBlank() ? reports.findAllByOrderByCreatedAtDesc(pr)
				: reports.findByStatusOrderByCreatedAtDesc(ChatReport.Status.valueOf(status), pr)).map(this::reportView)));
	}

	/** The reported conversation, read-only, for staff. Unreported conversations stay private. */
	public Thread reportedThread(Long reportId) {
		return tx.execute(s -> {
			ChatReport r = reports.findById(reportId).orElseThrow(() -> ApiException.notFound("Report"));
			Conversation c = conversations.findById(r.getConversationId()).orElseThrow();
			Party p = new Party(c, Conversation.Side.BUYER, shops.findById(c.getShopId()).orElse(null));
			List<ChatMessage> list = messages.latest(c.getId(), PageRequest.of(0, 500)).reversed();
			return new Thread(view(p, null), messageViews(list, null, p), false);
		});
	}

	public ReportView resolve(Long reportId, String resolution, boolean blockConversation, String staff) {
		return tx.execute(s -> {
			ChatReport r = reports.findById(reportId).orElseThrow(() -> ApiException.notFound("Report"));
			r.setStatus(ChatReport.Status.RESOLVED);
			r.setResolution(resolution == null || resolution.isBlank() ? null : resolution.strip());
			r.setResolvedBy(staff);
			r.setResolvedAt(Instant.now());
			if (blockConversation) {
				conversations.findById(r.getConversationId()).ifPresent(c -> c.setBlockedBy(
						c.getBuyerId().equals(r.getReporterId()) ? Conversation.Side.BUYER : Conversation.Side.SELLER));
			}
			return reportView(r);
		});
	}

	public ReportView report(Long reportId) {
		return tx.execute(s -> reportView(reports.findById(reportId).orElseThrow(() -> ApiException.notFound("Report"))));
	}

	public long openReports() {
		return reports.countByStatus(ChatReport.Status.OPEN);
	}

	private ReportView reportView(ChatReport r) {
		Conversation c = conversations.findById(r.getConversationId()).orElseThrow();
		String buyer = users.findById(c.getBuyerId()).map(User::getFullName).orElse("Buyer");
		String shop = shops.findById(c.getShopId()).map(Shop::getName).orElse("Shop");
		return new ReportView(r.getId(), r.getConversationId(), r.getReason().name(), r.getDetails(), r.getStatus().name(),
				r.getResolution(), r.getResolvedBy(), r.getResolvedAt(), r.getCreatedAt(), buyer, shop,
				c.getBuyerId().equals(r.getReporterId()) ? "BUYER" : "SELLER");
	}

	// ---------- helpers ----------

	private Party party(UUID userId, Long conversationId) {
		return toParty(userId, conversations.findById(conversationId).orElseThrow(() -> ApiException.notFound("Conversation")));
	}

	private Party lockedParty(UUID userId, Long conversationId) {
		return toParty(userId, conversations.lockById(conversationId).orElseThrow(() -> ApiException.notFound("Conversation")));
	}

	private Party toParty(UUID userId, Conversation c) {
		Shop shop = shops.findById(c.getShopId()).orElse(null);
		if (c.getBuyerId().equals(userId)) {
			return new Party(c, Conversation.Side.BUYER, shop);
		}
		if (shop != null && shop.getOwnerId().equals(userId)) {
			return new Party(c, Conversation.Side.SELLER, shop);
		}
		throw ApiException.notFound("Conversation"); // same answer as a missing one, so ids can't be probed
	}

	private void systemNote(Long conversationId, String text) {
		tx.executeWithoutResult(s -> {
			ChatMessage m = new ChatMessage();
			m.setConversationId(conversationId);
			m.setSenderRole(ChatMessage.SenderRole.SYSTEM);
			m.setKind(ChatMessage.Kind.SYSTEM);
			m.setBody(text);
			messages.save(m);
			conversations.findById(conversationId).ifPresent(c -> {
				c.setLastMessageAt(m.getCreatedAt());
				c.setLastMessagePreview(text.length() > 150 ? text.substring(0, 150) + "…" : text);
			});
		});
	}

	private ConversationView view(Party p, UUID viewer) {
		Conversation c = p.c();
		ProductCard card = null;
		if (c.getProductId() != null) {
			card = products.findById(c.getProductId()).map(this::card).orElse(null);
		}
		String other = p.side() == Conversation.Side.BUYER
				? (p.shop() == null ? "Shop" : p.shop().getName())
				: users.findById(c.getBuyerId()).map(User::getFullName).orElse("Buyer");
		Instant read = c.lastReadAt(p.side());
		boolean unread = viewer != null && (read == null || read.isBefore(c.getLastMessageAt()));
		return new ConversationView(c.getId(), p.side().name(), other, p.shop() == null ? null : p.shop().getName(),
				p.shop() == null ? null : p.shop().getSlug(), card, c.getLastMessagePreview(), c.getLastMessageAt(), unread,
				c.getBlockedBy() == null ? null : c.getBlockedBy().name());
	}

	private ProductCard card(Product p) {
		return new ProductCard(p.getId(), p.getName(), p.getSlug(), p.getPrice(), p.getImageUrl(),
				p.isActive() && p.getStock() - p.getReserved() > 0);
	}

	private List<MessageView> messageViews(List<ChatMessage> list, UUID viewer, Party p) {
		List<Long> offerIds = list.stream().map(ChatMessage::getOfferId).filter(java.util.Objects::nonNull).toList();
		Map<Long, OfferView> offerViews = offerIds.isEmpty() ? Map.of() : offerViews(offers.findByIdIn(offerIds), viewer, p);
		return list.stream().map(m -> new MessageView(m.getId(), m.getSenderRole().name(),
				viewer != null && viewer.equals(m.getSenderId()), m.getKind().name(), m.getBody(),
				m.getImageKey() == null ? null : media.urlFor(m.getImageKey()),
				m.getOfferId() == null ? null : offerViews.get(m.getOfferId()), m.isFlagged(), m.getCreatedAt())).toList();
	}

	private Map<Long, OfferView> offerViews(List<ChatOffer> list, UUID viewer, Party p) {
		Instant now = Instant.now();
		Map<Long, String> names = new HashMap<>();
		products.findAllById(list.stream().map(ChatOffer::getProductId).distinct().toList())
				.forEach(prod -> names.put(prod.getId(), prod.getName()));
		Map<Long, OfferView> out = new HashMap<>();
		for (ChatOffer o : list) {
			boolean mine = viewer != null && o.getMadeBy() == p.side();
			String status = (o.getStatus() == ChatOffer.Status.PENDING || o.getStatus() == ChatOffer.Status.ACCEPTED)
					&& !o.getExpiresAt().isAfter(now) ? ChatOffer.Status.EXPIRED.name() : o.getStatus().name();
			boolean open = o.isOpen(now);
			out.put(o.getId(), new OfferView(o.getId(), o.getProductId(), names.getOrDefault(o.getProductId(), "Item"),
					o.getQuantity(), o.getUnitPrice(), o.getUnitPrice().multiply(BigDecimal.valueOf(o.getQuantity())),
					o.getMadeBy().name(), mine, status, o.getExpiresAt(), viewer != null && open && !mine,
					viewer != null && open && mine,
					viewer != null && p.side() == Conversation.Side.BUYER && o.isBuyable(now)));
		}
		return out;
	}

	/** The other side gets one in-app notification per conversation per hour, not one per message. */
	private void notifyInbox(Party p, UUID senderId, String preview) {
		boolean toSeller = p.side() == Conversation.Side.BUYER;
		UUID recipient = toSeller ? (p.shop() == null ? null : p.shop().getOwnerId()) : p.c().getBuyerId();
		String from = toSeller ? users.findById(senderId).map(User::getFullName).orElse("A buyer")
				: (p.shop() == null ? "A shop" : p.shop().getName());
		long hour = Instant.now().getEpochSecond() / 3600;
		inbox.notify(recipient, et.tenapay.shop.inbox.InboxItem.Kind.CHAT, "New message from " + from, preview,
				"/chats/" + p.c().getId(), "INBOX:CHAT:" + p.c().getId() + ":" + (toSeller ? "S" : "B") + ":" + hour);
	}

	/** Texts the other side about new messages, at most once per conversation every 6 hours. */
	private void nudgeBySms(Party p, UUID senderId) {
		try {
			boolean toSeller = p.side() == Conversation.Side.BUYER;
			String phone;
			String from;
			if (toSeller) {
				phone = p.shop() == null ? null : p.shop().getPhone();
				if (phone == null && p.shop() != null) {
					phone = users.findById(p.shop().getOwnerId()).map(User::getPhone).orElse(null);
				}
				from = users.findById(senderId).map(User::getFullName).orElse("a buyer");
			} else {
				phone = users.findById(p.c().getBuyerId()).map(User::getPhone).orElse(null);
				from = p.shop() == null ? "a shop" : p.shop().getName();
			}
			if (phone == null || !phone.matches("^\\+251[79]\\d{8}$")) {
				return;
			}
			UUID recipient = toSeller ? (p.shop() == null ? null : p.shop().getOwnerId()) : p.c().getBuyerId();
			if (!inbox.wantsSms(recipient, et.tenapay.shop.inbox.InboxService.SmsTopic.CHAT)) {
				return;
			}
			long bucket = Instant.now().getEpochSecond() / SMS_NUDGE_EVERY.toSeconds();
			String key = "CHAT:" + p.c().getId() + ":" + (toSeller ? "S" : "B") + ":" + bucket;
			String name = from.replaceAll("[^\\x20-\\x7E]", "").trim();
			String text = "Sodo Gebeya: new message from " + (name.isEmpty() ? (toSeller ? "a buyer" : "a shop")
					: (name.length() > 30 ? name.substring(0, 30) : name)) + ". Reply: "
					+ app.publicBaseUrl().replaceAll("/+$", "") + "/chats/" + p.c().getId();
			String to = phone;
			java.util.concurrent.CompletableFuture.runAsync(() -> sms.sendOnce(SmsService.Kind.CHAT, to, text, null, key));
		} catch (RuntimeException e) {
			log.warn("Chat SMS nudge failed: {}", e.getMessage());
		}
	}
}
