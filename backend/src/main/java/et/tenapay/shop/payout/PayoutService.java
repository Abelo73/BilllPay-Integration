package et.tenapay.shop.payout;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderItem;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Seller money (M6). When an order is paid, each seller parcel records its commission and what the seller earns; the
 * money is held until the buyer confirms receipt or {@code app.payouts.release-after} (48 h) after delivery, then
 * becomes available. Sellers ask for payouts of available money; staff send them and record the transfer reference.
 * Discount codes are Sodo Gebeya's, so sellers always earn the full item price plus their delivery fee, minus commission.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PayoutService {

	private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

	private final OrderParcelRepository parcels;
	private final CommissionRuleRepository rules;
	private final PayoutRepository payouts;
	private final ProductRepository products;
	private final ShopRepository shops;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final et.tenapay.shop.dispute.DisputeRepository disputes;
	private final TransactionTemplate tx;

	@Value("${app.payouts.release-after:48h}")
	private Duration releaseAfter = Duration.ofHours(48);

	@Value("${app.payouts.minimum:100}")
	private BigDecimal minimum = HUNDRED;

	public record Balance(BigDecimal held, BigDecimal available, BigDecimal requested, BigDecimal paidOut,
			BigDecimal minimum, Duration releaseAfter) {
	}

	// ---------- commission ----------

	/** The commission percent for one line: seller + category > seller > category > default (0 if none). */
	public BigDecimal percentFor(Long shopId, Long categoryId) {
		return rules.candidates(shopId, categoryId).stream()
				.max(Comparator.comparingInt((CommissionRule r) -> (r.getShopId() != null ? 2 : 0) + (r.getCategoryId() != null ? 1 : 0)))
				.map(CommissionRule::getPercent).orElse(BigDecimal.ZERO);
	}

	/** Called in the transaction that marks the order paid: locks commission and earnings, held until delivery. */
	public void lockEarnings(Order order) {
		List<OrderParcel> list = parcels.findByOrderIdOrderByParcelNoAsc(order.getId());
		Map<Long, Long> categoryOf = new HashMap<>();
		products.findAllById(order.getItems().stream().map(OrderItem::getProductId).toList())
				.forEach(p -> categoryOf.put(p.getId(), p.getCategory().getId()));
		for (OrderParcel p : list) {
			if (p.getShopId() == null || p.getPayoutStatus() != null) {
				continue; // Sodo Gebeya's own parcel, or already locked
			}
			BigDecimal commission = BigDecimal.ZERO;
			for (OrderItem i : order.getItems()) {
				if (Objects.equals(i.getParcelNo(), p.getParcelNo())) {
					BigDecimal pct = percentFor(p.getShopId(), categoryOf.get(i.getProductId()));
					commission = commission.add(i.getLineTotal().multiply(pct).divide(HUNDRED, 2, RoundingMode.HALF_UP));
				}
			}
			p.setCommissionAmount(commission);
			p.setCommissionPercent(p.getItemsTotal().signum() == 0 ? BigDecimal.ZERO
					: commission.multiply(HUNDRED).divide(p.getItemsTotal(), 2, RoundingMode.HALF_UP));
			p.setSellerAmount(p.getItemsTotal().add(p.getDeliveryFee()).subtract(commission));
			p.setPayoutStatus(EarningStatus.HELD);
		}
	}

	// ---------- release ----------

	/** The buyer confirmed receipt (or the window passed): the seller can withdraw this parcel's money. */
	public void release(OrderParcel p, String why) {
		if (p.getPayoutStatus() != EarningStatus.HELD) {
			return;
		}
		if (disputes.existsByParcelIdAndStatus(p.getId(), et.tenapay.shop.dispute.Dispute.Status.OPEN)) {
			log.info("Parcel #{} stays held: a problem report is open", p.getId());
			return; // staff settle it first (M8)
		}
		p.setPayoutStatus(EarningStatus.RELEASED);
		p.setReleasedAt(Instant.now());
		metrics.shopEvent("earnings_released");
		log.info("Parcel #{} money released ({}): {} ETB", p.getId(), why, p.getSellerAmount());
	}

	/** A parcel cancelled before it went out: its money goes back to the buyer, not the seller. */
	public static void cancel(OrderParcel p) {
		if (p.getPayoutStatus() == EarningStatus.HELD) {
			p.setPayoutStatus(EarningStatus.CANCELLED);
		}
	}

	/** Every hour: delivered parcels with no complaint after the window are released. */
	@Scheduled(fixedDelayString = "${app.payouts.release-check:PT1H}", initialDelayString = "PT2M")
	public int releaseDue() {
		Integer n = tx.execute(s -> {
			List<OrderParcel> due = parcels.dueForRelease(Instant.now().minus(releaseAfter));
			due.forEach(p -> release(p, "delivered " + releaseAfter.toHours() + " h ago"));
			return due.size();
		});
		return n == null ? 0 : n;
	}

	// ---------- balances and payouts ----------

	public Balance balance(Long shopId) {
		BigDecimal released = parcels.sumEarnings(shopId, EarningStatus.RELEASED);
		BigDecimal requested = payouts.sumFor(shopId, EnumSet.of(PayoutStatus.REQUESTED));
		BigDecimal paid = payouts.sumFor(shopId, EnumSet.of(PayoutStatus.PAID));
		return new Balance(parcels.sumEarnings(shopId, EarningStatus.HELD), released.subtract(requested).subtract(paid),
				requested, paid, minimum, releaseAfter);
	}

	public record AccountForm(String method, String provider, String accountName, String account) {
	}

	public Shop saveAccount(Long shopId, AccountForm f) {
		return tx.execute(s -> {
			Shop shop = shops.findById(shopId).orElseThrow();
			String method = f.method() == null ? "" : f.method().trim().toUpperCase();
			if (!List.of("BANK", "TELEBIRR", "CBE_BIRR", "OTHER").contains(method)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "METHOD_INVALID", "Choose bank, telebirr, CBE Birr or other.");
			}
			if (blank(f.accountName()) || blank(f.account())) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_REQUIRED", "Enter the account holder's name and the account or phone number.");
			}
			if (method.equals("BANK") && blank(f.provider())) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BANK_REQUIRED", "Enter the bank's name.");
			}
			shop.setPayoutMethod(method);
			shop.setPayoutProvider(blank(f.provider()) ? null : f.provider().trim());
			shop.setPayoutAccountName(f.accountName().trim());
			shop.setPayoutAccount(f.account().replaceAll("\\s+", ""));
			return shop;
		});
	}

	/** A seller asks for some or all of their available money. One open request at a time. */
	public Payout request(Long shopId, BigDecimal amount, String by) {
		return tx.execute(s -> {
			Shop shop = shops.lockById(shopId).orElseThrow();
			if (shop.getPayoutAccount() == null) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "NO_PAYOUT_ACCOUNT", "Add where we should send your money first.");
			}
			if (payouts.existsByShopIdAndStatus(shopId, PayoutStatus.REQUESTED)) {
				throw new ApiException(HttpStatus.CONFLICT, "PAYOUT_PENDING", "You already have a payout on its way. Wait for it, then ask again.");
			}
			BigDecimal value = amount == null ? null : amount.setScale(2, RoundingMode.HALF_UP);
			Balance b = balance(shopId);
			if (value == null || value.compareTo(minimum) < 0) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BELOW_MINIMUM", "The smallest payout is " + minimum + " ETB.",
						Map.of("minimum", minimum));
			}
			if (value.compareTo(b.available()) > 0) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "MORE_THAN_AVAILABLE", "You can withdraw up to " + b.available() + " ETB.",
						Map.of("available", b.available()));
			}
			Payout p = new Payout();
			p.setShopId(shopId);
			p.setAmount(value);
			p.setMethod(shop.getPayoutMethod());
			p.setProvider(shop.getPayoutProvider());
			p.setAccountName(shop.getPayoutAccountName());
			p.setAccount(shop.getPayoutAccount());
			p.setRequestedBy(by);
			payouts.save(p);
			metrics.shopEvent("payout_requested");
			log.info("Payout #{} of {} ETB requested by shop #{}", p.getId(), value, shopId);
			return p;
		});
	}

	/** Staff: sent (with the transfer reference) or rejected (with a reason; the money is available again). */
	public Payout decide(Long payoutId, PayoutStatus to, String reference, String note, String by) {
		if (to == PayoutStatus.PAID && blank(reference)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REFERENCE_REQUIRED", "Enter the transfer reference.");
		}
		if (to == PayoutStatus.REJECTED && blank(note)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Tell the seller why.");
		}
		if (to == PayoutStatus.REQUESTED) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DECISION", "Mark it paid or rejected.");
		}
		Payout p = tx.execute(s -> {
			Payout po = payouts.findById(payoutId).orElseThrow(() -> ApiException.notFound("Payout"));
			if (po.getStatus() != PayoutStatus.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This payout was already " + po.getStatus().name().toLowerCase() + ".");
			}
			po.setStatus(to);
			po.setReference(blank(reference) ? null : reference.trim());
			po.setNote(blank(note) ? null : note.trim());
			po.setDecidedBy(by);
			po.setDecidedAt(Instant.now());
			metrics.shopEvent("payout_" + to.name().toLowerCase());
			log.info("Payout #{} {} by {}", po.getId(), to, by);
			return po;
		});
		shops.findById(p.getShopId()).map(Shop::getPhone).ifPresent(phone -> {
			String text = to == PayoutStatus.PAID
					? "Sodo Gebeya: we sent you " + p.getAmount().toPlainString() + " ETB (ref " + p.getReference() + ")."
					: "Sodo Gebeya: your payout of " + p.getAmount().toPlainString() + " ETB was not sent: " + p.getNote()
							+ ". The money is back in your balance.";
			AfterCommit.run(() -> sms.send(SmsService.Kind.SHOP, phone, text, null, null));
		});
		return p;
	}

	private static boolean blank(String s) {
		return s == null || s.isBlank();
	}

	/** For tests and the admin: the release window in force. */
	public Duration releaseAfter() {
		return releaseAfter;
	}

}
