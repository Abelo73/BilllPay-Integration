package et.tenapay.shop.dispute;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.payout.EarningStatus;
import et.tenapay.shop.payout.PayoutService;
import et.tenapay.shop.refund.RefundService;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * M8: a buyer reports a problem with one parcel while its money is still held. The seller answers in the same thread;
 * staff decide: refund the parcel, refund part (the seller gets the rest), or pay the seller. The money stays held
 * until then (no automatic release).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DisputeService {

	static final int MAX_PHOTOS = 4;

	private final DisputeRepository disputes;
	private final DisputeMessageRepository messages;
	private final DisputePhotoRepository photos;
	private final OrderRepository orders;
	private final OrderParcelRepository parcels;
	private final ShopRepository shops;
	private final PayoutService payouts;
	private final RefundService refunds;
	private final SmsService sms;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	/** Who is looking: decides what they may do. */
	public enum Viewer { BUYER, SELLER, STAFF }

	public enum Outcome { REFUND, PART_REFUND, PAY_SELLER }

	// ---------- buyer ----------

	public Dispute open(UUID buyerId, String orderNumber, int parcelNo, Dispute.Reason reason, String details) {
		if (reason == null) {
			throw bad("REASON_REQUIRED", "Choose what went wrong.");
		}
		if (details == null || details.trim().length() < 10) {
			throw bad("DETAILS_REQUIRED", "Tell us what happened (at least a sentence).");
		}
		Order order = ownedOrder(buyerId, orderNumber);
		OrderParcel parcel = parcel(order, parcelNo);
		if (parcel.getPayoutStatus() == null) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_PAID", "This order isn't paid, so there's nothing to dispute.");
		}
		if (parcel.getPayoutStatus() != EarningStatus.HELD) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_LATE",
					parcel.getPayoutStatus() == EarningStatus.CANCELLED ? "This part of the order was cancelled and refunded."
							: "The seller has already been paid for this. Contact Sodo Gebeya support for help.");
		}
		Dispute d;
		try {
			d = tx.execute(s -> {
				Dispute x = new Dispute();
				x.setOrderId(order.getId());
				x.setParcelId(parcel.getId());
				x.setShopId(parcel.getShopId());
				x.setBuyerId(buyerId);
				x.setReason(reason);
				x.setDetails(cut(details, 2000));
				return disputes.saveAndFlush(x);
			});
		} catch (DataIntegrityViolationException twice) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_OPEN", "You already reported a problem with this. Add to that conversation instead.");
		}
		metrics.shopEvent("dispute_opened");
		log.info("Dispute #{} opened on {} ({})", d.getId(), parcel.number(order.getOrderNumber()), reason);
		sellerPhone(d).ifPresent(phone -> sms.send(SmsService.Kind.ORDER, phone,
				"Sodo Gebeya: a buyer reported a problem with order " + parcel.number(order.getOrderNumber())
						+ ". Please answer in Seller > Orders > Problems. The money stays held until it's settled.",
				null, order.getOrderNumber()));
		return d;
	}

	public DisputePhoto addPhoto(UUID buyerId, Long disputeId, byte[] upload) {
		Dispute d = disputes.findById(disputeId).filter(x -> buyerId.equals(x.getBuyerId())).orElseThrow(() -> ApiException.notFound("Problem"));
		if (!d.getStatus().open()) {
			throw closed();
		}
		if (photos.countByDisputeId(d.getId()) >= MAX_PHOTOS) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_PHOTOS", "Up to " + MAX_PHOTOS + " photos.");
		}
		ImageProcessor.Processed img = images.process(upload);
		String key = "private/disputes/" + d.getId() + "/" + UUID.randomUUID() + ".jpg";
		storage.put(key, img.large(), "image/jpeg");
		return tx.execute(s -> {
			DisputePhoto p = new DisputePhoto();
			p.setDisputeId(d.getId());
			p.setStorageKey(key);
			return photos.save(p);
		});
	}

	public Dispute withdraw(UUID buyerId, Long disputeId) {
		return tx.execute(s -> {
			Dispute d = disputes.findById(disputeId).filter(x -> buyerId.equals(x.getBuyerId())).orElseThrow(() -> ApiException.notFound("Problem"));
			if (!d.getStatus().open()) {
				throw closed();
			}
			d.setStatus(Dispute.Status.WITHDRAWN);
			d.setResolvedAt(Instant.now());
			addMessage(d, DisputeMessage.Author.BUYER, "Buyer", "I closed this: it's sorted out.");
			return d;
		});
	}

	// ---------- everyone in the thread ----------

	public DisputeMessage message(Dispute d, Viewer who, String name, String body) {
		if (body == null || body.isBlank()) {
			throw bad("MESSAGE_REQUIRED", "Write a message.");
		}
		if (!d.getStatus().open()) {
			throw closed();
		}
		DisputeMessage m = tx.execute(s -> {
			Dispute fresh = disputes.findById(d.getId()).orElseThrow();
			if (who == Viewer.SELLER && fresh.getSellerRepliedAt() == null) {
				fresh.setSellerRepliedAt(Instant.now());
			}
			return addMessage(fresh, DisputeMessage.Author.valueOf(who.name()), name, body);
		});
		String ref = orderRef(d);
		if (who != Viewer.BUYER) {
			buyerPhone(d).ifPresent(phone -> sms.send(SmsService.Kind.ORDER, phone,
					"Sodo Gebeya: " + (who == Viewer.SELLER ? "the seller" : "our team") + " answered about your problem with order " + ref
							+ ". Open My orders to read it.", null, null));
		}
		if (who == Viewer.STAFF) {
			sellerPhone(d).ifPresent(phone -> sms.send(SmsService.Kind.ORDER, phone,
					"Sodo Gebeya: our team wrote about the problem with order " + ref + ". Open Seller > Orders > Problems.", null, null));
		}
		return m;
	}

	// ---------- staff ----------

	/**
	 * REFUND: the buyer gets this parcel's share back (items after discount, plus its delivery fee); the seller isn't paid.
	 * PART_REFUND: the buyer gets {@code amount}; the seller is paid the rest. PAY_SELLER: no refund, the money is released.
	 */
	public Dispute decide(Long disputeId, Outcome outcome, BigDecimal amount, String note, String by) {
		return settle(disputeId, outcome, amount, note, by, DisputeMessage.Author.STAFF, "Sodo Gebeya");
	}

	// ---------- settled without staff ----------

	/** The seller agrees: the buyer gets the whole parcel back at once (the seller's held money is cancelled). */
	public Dispute sellerRefundInFull(Long disputeId, Long shopId, String shopName, String note) {
		Dispute d = sellersOpen(disputeId, shopId);
		String text = note == null || note.isBlank() ? "We refunded you in full." : note.trim();
		return settle(d.getId(), Outcome.REFUND, null, text, "seller " + shopName, DisputeMessage.Author.SELLER, shopName);
	}

	/** The seller offers part of the money back; nothing moves until the buyer accepts. */
	public Dispute sellerOfferPart(Long disputeId, Long shopId, String shopName, BigDecimal amount, String note) {
		Dispute d = sellersOpen(disputeId, shopId);
		BigDecimal max = parcelPaid(parcels.findById(d.getParcelId()).orElseThrow());
		if (amount == null || amount.signum() <= 0 || amount.compareTo(max) >= 0) {
			throw bad("AMOUNT_INVALID", "Offer more than 0 and less than " + max + " birr (the parcel's total); for everything, refund in full.");
		}
		BigDecimal offer = amount.setScale(2, RoundingMode.HALF_UP);
		Dispute saved = tx.execute(s -> {
			Dispute x = disputes.findById(d.getId()).orElseThrow();
			x.setSellerOfferAmount(offer);
			x.setSellerOfferAt(Instant.now());
			if (x.getSellerRepliedAt() == null) {
				x.setSellerRepliedAt(Instant.now());
			}
			addMessage(x, DisputeMessage.Author.SELLER, shopName, "Offer: " + offer + " birr back to you; you keep the items."
					+ (note == null || note.isBlank() ? "" : " " + note.trim()));
			return x;
		});
		buyerPhone(d).ifPresent(phone -> sms.send(SmsService.Kind.ORDER, phone, "Sodo Gebeya: the seller offers " + offer
				+ " birr back for your problem with order " + orderRef(d) + ". Open My orders to accept or decline.", null, null));
		log.info("Dispute #{}: seller offered {} ETB", d.getId(), offer);
		return saved;
	}

	/** The buyer takes the seller's offer: part refund, the seller is paid the rest. */
	public Dispute buyerAcceptOffer(UUID buyerId, Long disputeId) {
		Dispute d = disputes.findById(disputeId).filter(x -> buyerId.equals(x.getBuyerId())).orElseThrow(() -> ApiException.notFound("Problem"));
		if (!d.getStatus().open()) {
			throw closed();
		}
		if (d.getSellerOfferAmount() == null) {
			throw new ApiException(HttpStatus.CONFLICT, "NO_OFFER", "The seller hasn't offered anything (or withdrew it).");
		}
		BigDecimal offer = d.getSellerOfferAmount();
		return settle(d.getId(), Outcome.PART_REFUND, offer, "I accepted the seller's offer of " + offer + " birr.",
				"buyer (accepted the seller's offer)", DisputeMessage.Author.BUYER, "Buyer");
	}

	/** The buyer says no to the offer; the problem stays open for staff to decide. */
	public Dispute buyerDeclineOffer(UUID buyerId, Long disputeId) {
		Dispute declined = tx.execute(s -> {
			Dispute x = disputes.findById(disputeId).filter(y -> buyerId.equals(y.getBuyerId())).orElseThrow(() -> ApiException.notFound("Problem"));
			if (!x.getStatus().open()) {
				throw closed();
			}
			if (x.getSellerOfferAmount() == null) {
				throw new ApiException(HttpStatus.CONFLICT, "NO_OFFER", "There's no offer to decline.");
			}
			addMessage(x, DisputeMessage.Author.BUYER, "Buyer", "I declined the offer of " + x.getSellerOfferAmount()
					+ " birr. Sodo Gebeya, please decide.");
			x.setSellerOfferAmount(null);
			x.setSellerOfferAt(null);
			return x;
		});
		sellerPhone(declined).ifPresent(phone -> sms.send(SmsService.Kind.ORDER, phone, "Sodo Gebeya: the buyer declined your offer for order "
				+ orderRef(declined) + ". Our team will decide; you can still refund in full in Seller > Orders > Problems.", null, null));
		return declined;
	}

	private Dispute sellersOpen(Long disputeId, Long shopId) {
		Dispute d = disputes.findById(disputeId).filter(x -> shopId != null && shopId.equals(x.getShopId()))
				.orElseThrow(() -> ApiException.notFound("Problem"));
		if (!d.getStatus().open()) {
			throw closed();
		}
		return d;
	}

	private Dispute settle(Long disputeId, Outcome outcome, BigDecimal amount, String note, String by,
			DisputeMessage.Author author, String authorName) {
		if (outcome == null) {
			throw bad("OUTCOME_REQUIRED", "Choose refund, part refund or pay the seller.");
		}
		if (note == null || note.isBlank()) {
			throw bad("NOTE_REQUIRED", "Write the decision; the buyer and the seller see it.");
		}
		Dispute d = disputes.findById(disputeId).orElseThrow(() -> ApiException.notFound("Problem"));
		if (!d.getStatus().open()) {
			throw closed();
		}
		OrderParcel parcel = parcels.findById(d.getParcelId()).orElseThrow();
		Order order = orders.findById(d.getOrderId()).orElseThrow();
		BigDecimal max = parcelPaid(parcel);
		BigDecimal refund = switch (outcome) {
			case REFUND -> max;
			case PART_REFUND -> {
				if (amount == null || amount.signum() <= 0 || amount.compareTo(max) >= 0) {
					throw bad("AMOUNT_INVALID", "A part refund is more than 0 and less than " + max + " birr (the parcel's total).");
				}
				yield amount.setScale(2, RoundingMode.HALF_UP);
			}
			case PAY_SELLER -> BigDecimal.ZERO;
		};
		if (refund.signum() > 0) {
			// BillPay first: if it fails, nothing changes and staff can try again
			refunds.create(order.getOrderNumber(), refund, "Problem #" + d.getId() + " (" + d.getReason() + ")", null);
		}
		Dispute decided = tx.execute(s -> {
			Dispute x = disputes.findById(disputeId).orElseThrow();
			OrderParcel p = parcels.findById(parcel.getId()).orElseThrow();
			x.setStatus(switch (outcome) {
				case REFUND -> Dispute.Status.REFUNDED;
				case PART_REFUND -> Dispute.Status.PART_REFUNDED;
				case PAY_SELLER -> Dispute.Status.SELLER_PAID;
			});
			x.setRefundAmount(refund.signum() > 0 ? refund : null);
			x.setDecisionNote(cut(note, 1000));
			x.setDecidedBy(by);
			x.setResolvedAt(Instant.now());
			x.setSellerOfferAmount(null);
			x.setSellerOfferAt(null);
			if (outcome == Outcome.REFUND) {
				PayoutService.cancel(p);
			} else {
				if (outcome == Outcome.PART_REFUND && p.getSellerAmount() != null) {
					p.setSellerAmount(p.getSellerAmount().subtract(refund).max(BigDecimal.ZERO));
				}
				payouts.release(p, "problem #" + x.getId() + " settled");
			}
			addMessage(x, author, authorName, (author == DisputeMessage.Author.STAFF ? "Decision: " : "Settled: ")
					+ describe(outcome, refund) + ". " + note.trim());
			return x;
		});
		metrics.shopEvent("dispute_" + outcome.name().toLowerCase());
		log.info("Dispute #{} decided {} ({} ETB) by {}", d.getId(), outcome, refund, by);
		String text = "Sodo Gebeya: the problem with order " + orderRef(d) + " is settled: " + describe(outcome, refund) + ".";
		buyerPhone(d).ifPresent(phone -> AfterCommit.run(() -> sms.send(SmsService.Kind.ORDER, phone, text, null, null)));
		sellerPhone(d).ifPresent(phone -> AfterCommit.run(() -> sms.send(SmsService.Kind.ORDER, phone, text, null, null)));
		return decided;
	}

	// ---------- access and helpers ----------

	/** The buyer, the seller of the parcel, or null when this person may not see it. */
	public Viewer viewerOf(Dispute d, UUID userId) {
		if (userId == null) {
			return null;
		}
		if (userId.equals(d.getBuyerId())) {
			return Viewer.BUYER;
		}
		if (d.getShopId() != null && shops.findById(d.getShopId()).map(Shop::getOwnerId).filter(userId::equals).isPresent()) {
			return Viewer.SELLER;
		}
		return null;
	}

	public ResponseEntity<byte[]> photo(Dispute d, Long photoId) {
		DisputePhoto p = photos.findById(photoId).filter(x -> x.getDisputeId().equals(d.getId())).orElseThrow(() -> ApiException.notFound("Photo"));
		MediaStorage.StoredObject obj = storage.get(p.getStorageKey()).orElseThrow(() -> ApiException.notFound("Photo"));
		try (InputStream in = obj.content()) {
			return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore()).body(in.readAllBytes());
		} catch (java.io.IOException e) {
			throw new java.io.UncheckedIOException(e);
		}
	}

	public Order ownedOrder(UUID buyerId, String orderNumber) {
		return orders.findByOrderNumber(orderNumber).filter(o -> buyerId != null && buyerId.equals(o.getUserId()))
				.orElseThrow(() -> ApiException.notFound("Order"));
	}

	/** What the buyer paid for this parcel: its items after its share of the discount, plus its delivery fee. */
	public static BigDecimal parcelPaid(OrderParcel p) {
		BigDecimal items = p.getItemsTotal() == null ? BigDecimal.ZERO : p.getItemsTotal();
		BigDecimal discount = p.getDiscountShare() == null ? BigDecimal.ZERO : p.getDiscountShare();
		BigDecimal delivery = p.getDeliveryFee() == null ? BigDecimal.ZERO : p.getDeliveryFee();
		return items.subtract(discount).add(delivery).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
	}

	public String orderRef(Dispute d) {
		Order o = orders.findById(d.getOrderId()).orElseThrow();
		return parcels.findById(d.getParcelId()).map(p -> p.number(o.getOrderNumber())).orElse(o.getOrderNumber());
	}

	public List<DisputeMessage> thread(Dispute d) {
		return messages.findByDisputeIdOrderByIdAsc(d.getId());
	}

	private OrderParcel parcel(Order order, int parcelNo) {
		return parcels.findByOrderIdOrderByParcelNoAsc(order.getId()).stream().filter(p -> p.getParcelNo() == parcelNo).findFirst()
				.orElseThrow(() -> ApiException.notFound("Parcel"));
	}

	private DisputeMessage addMessage(Dispute d, DisputeMessage.Author author, String name, String body) {
		DisputeMessage m = new DisputeMessage();
		m.setDisputeId(d.getId());
		m.setAuthor(author);
		m.setAuthorName(name == null ? null : cut(name, 200));
		m.setBody(cut(body, 2000));
		return messages.save(m);
	}

	private java.util.Optional<String> sellerPhone(Dispute d) {
		return d.getShopId() == null ? java.util.Optional.empty() : shops.findById(d.getShopId()).map(Shop::getPhone).filter(p -> !p.isBlank());
	}

	private java.util.Optional<String> buyerPhone(Dispute d) {
		return orders.findById(d.getOrderId()).map(Order::getCustomerPhone).filter(p -> p != null && !p.isBlank());
	}

	private static String describe(Outcome o, BigDecimal refund) {
		return switch (o) {
			case REFUND -> "full refund of " + refund + " birr to the buyer";
			case PART_REFUND -> refund + " birr back to the buyer, the rest to the seller";
			case PAY_SELLER -> "no refund, the seller is paid";
		};
	}

	private static ApiException closed() {
		return new ApiException(HttpStatus.CONFLICT, "PROBLEM_CLOSED", "This problem is already settled.");
	}

	private static ApiException bad(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}
}
