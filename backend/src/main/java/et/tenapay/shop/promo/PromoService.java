package et.tenapay.shop.promo;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * M16 boosts and M17 the Pro shop plan. While online payment is off, the seller pays by telebirr or bank and types the
 * transaction number; staff confirm and the boost starts (or the plan is extended) at once.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PromoService {

	static final Set<Integer> BOOST_DAYS = Set.of(3, 7, 14);
	static final Set<Integer> PLAN_MONTHS = Set.of(1, 3, 6, 12);
	private static final ZoneId ADDIS = ZoneId.of("Africa/Addis_Ababa");

	private final BoostRepository boosts;
	private final PlanOrderRepository planOrders;
	private final ProductRepository products;
	private final ShopRepository shops;
	private final Features features;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	// ---------- boosts (M16) ----------

	public BigDecimal boostPrice(int days) {
		return switch (days) {
			case 3 -> features.number(Features.BOOST_PRICE_3);
			case 7 -> features.number(Features.BOOST_PRICE_7);
			case 14 -> features.number(Features.BOOST_PRICE_14);
			default -> throw bad("DAYS_INVALID", "Choose 3, 7 or 14 days.");
		};
	}

	public Boost requestBoost(Shop shop, Long productId, int days, String reference) {
		features.require(Features.BOOSTS);
		if (!BOOST_DAYS.contains(days)) {
			throw bad("DAYS_INVALID", "Choose 3, 7 or 14 days.");
		}
		Product p = products.findById(productId).filter(x -> x.getShop() != null && x.getShop().getId().equals(shop.getId()))
				.orElseThrow(() -> ApiException.notFound("Product"));
		if (!p.isActive() || p.getBlockedReason() != null) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_IN_STORE", "Show the product in the store first.");
		}
		if (!shop.getStatus().selling()) {
			throw new ApiException(HttpStatus.CONFLICT, "SHOP_NOT_APPROVED", "Boosts start once your shop is approved.");
		}
		if (boosts.existsByProductIdAndStatusIn(productId, EnumSet.of(Boost.Status.REQUESTED))) {
			throw new ApiException(HttpStatus.CONFLICT, "BOOST_WAITING", "A boost for this product is already waiting for payment.");
		}
		BigDecimal price = boostPrice(days);
		return tx.execute(s -> {
			Boost b = new Boost();
			b.setProductId(productId);
			b.setShopId(shop.getId());
			b.setDays(days);
			b.setPrice(price);
			b.setPaymentReference(blank(reference) ? null : cut(reference, 120));
			metrics.shopEvent("boost_requested");
			return boosts.save(b);
		});
	}

	public Boost boostReference(Shop shop, Long boostId, String reference) {
		return tx.execute(s -> {
			Boost b = ownBoost(shop, boostId);
			if (b.getStatus() != Boost.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This boost is already decided.");
			}
			b.setPaymentReference(cut(reference, 120));
			return b;
		});
	}

	public Boost cancelBoost(Shop shop, Long boostId) {
		return tx.execute(s -> {
			Boost b = ownBoost(shop, boostId);
			if (b.getStatus() != Boost.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This boost is already decided.");
			}
			b.setStatus(Boost.Status.CANCELLED);
			return b;
		});
	}

	/** Staff: the money arrived. The boost starts now, or right after a boost that is still running. */
	public Boost confirmBoost(Long boostId, String reference, String by) {
		Boost done = tx.execute(s -> {
			Boost b = boosts.findById(boostId).orElseThrow(() -> ApiException.notFound("Boost"));
			if (b.getStatus() != Boost.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This boost is already decided.");
			}
			Product p = products.findById(b.getProductId()).orElseThrow();
			Instant now = Instant.now();
			Instant start = p.boosted() ? p.getBoostedUntil() : now;
			b.setStatus(Boost.Status.ACTIVE);
			b.setStartsAt(start);
			b.setEndsAt(start.plus(Duration.ofDays(b.getDays())));
			b.setDecidedBy(by);
			if (!blank(reference)) {
				b.setPaymentReference(cut(reference, 120));
			}
			p.setBoostedUntil(b.getEndsAt());
			log.info("Boost #{} for product #{} until {} (by {})", b.getId(), p.getId(), b.getEndsAt(), by);
			return b;
		});
		metrics.shopEvent("boost_started");
		sellerSms(done.getShopId(), "Sodo Gebeya: your boost is on. Your listing is at the top for " + done.getDays() + " days.");
		return done;
	}

	public Boost rejectBoost(Long boostId, String note, String by) {
		if (blank(note)) {
			throw bad("NOTE_REQUIRED", "Tell the seller why.");
		}
		Boost done = tx.execute(s -> {
			Boost b = boosts.findById(boostId).orElseThrow(() -> ApiException.notFound("Boost"));
			if (b.getStatus() != Boost.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This boost is already decided.");
			}
			b.setStatus(Boost.Status.REJECTED);
			b.setNote(cut(note, 500));
			b.setDecidedBy(by);
			return b;
		});
		sellerSms(done.getShopId(), "Sodo Gebeya: your boost wasn't started: " + cut(note, 120));
		return done;
	}

	/** Every hour: boosts past their end are marked ended (the listing already left the top on time). */
	@Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT3M")
	public int endBoosts() {
		Integer n = tx.execute(s -> {
			List<Boost> due = boosts.findByStatusAndEndsAtBefore(Boost.Status.ACTIVE, Instant.now());
			due.forEach(b -> b.setStatus(Boost.Status.ENDED));
			return due.size();
		});
		return n == null ? 0 : n;
	}

	// ---------- the Pro plan (M17) ----------

	public BigDecimal planPrice(int months) {
		if (!PLAN_MONTHS.contains(months)) {
			throw bad("MONTHS_INVALID", "Choose 1, 3, 6 or 12 months.");
		}
		return features.number(Features.PRO_PLAN_PRICE).multiply(BigDecimal.valueOf(months));
	}

	public PlanOrder requestPlan(Shop shop, int months, String reference) {
		features.require(Features.PRO_PLAN);
		BigDecimal price = planPrice(months);
		if (planOrders.existsByShopIdAndStatus(shop.getId(), PlanOrder.Status.REQUESTED)) {
			throw new ApiException(HttpStatus.CONFLICT, "PLAN_WAITING", "Your Pro plan request is already waiting for payment.");
		}
		return tx.execute(s -> {
			PlanOrder o = new PlanOrder();
			o.setShopId(shop.getId());
			o.setMonths(months);
			o.setPrice(price);
			o.setPaymentReference(blank(reference) ? null : cut(reference, 120));
			metrics.shopEvent("plan_requested");
			return planOrders.save(o);
		});
	}

	public PlanOrder planReference(Shop shop, Long orderId, String reference) {
		return tx.execute(s -> {
			PlanOrder o = ownPlan(shop, orderId);
			if (o.getStatus() != PlanOrder.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This request is already decided.");
			}
			o.setPaymentReference(cut(reference, 120));
			return o;
		});
	}

	public PlanOrder cancelPlan(Shop shop, Long orderId) {
		return tx.execute(s -> {
			PlanOrder o = ownPlan(shop, orderId);
			if (o.getStatus() != PlanOrder.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This request is already decided.");
			}
			o.setStatus(PlanOrder.Status.CANCELLED);
			return o;
		});
	}

	/** Staff: payment arrived; the plan runs from today, or from the end of the plan still running. */
	public PlanOrder confirmPlan(Long orderId, String reference, String by) {
		PlanOrder done = tx.execute(s -> {
			PlanOrder o = planOrders.findById(orderId).orElseThrow(() -> ApiException.notFound("Plan request"));
			if (o.getStatus() != PlanOrder.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This request is already decided.");
			}
			Shop shop = shops.findById(o.getShopId()).orElseThrow();
			Instant from = shop.pro() ? shop.getPlanUntil() : Instant.now();
			shop.setPlan("PRO");
			shop.setPlanUntil(ZonedDateTime.ofInstant(from, ADDIS).plusMonths(o.getMonths()).toInstant());
			shop.setPlanRemindedAt(null);
			o.setStatus(PlanOrder.Status.PAID);
			o.setDecidedBy(by);
			if (!blank(reference)) {
				o.setPaymentReference(cut(reference, 120));
			}
			log.info("Shop #{} is Pro until {} (plan order #{}, by {})", shop.getId(), shop.getPlanUntil(), o.getId(), by);
			return o;
		});
		metrics.shopEvent("plan_paid");
		sellerSms(done.getShopId(), "Sodo Gebeya: your Pro shop plan is active for " + done.getMonths() + (done.getMonths() == 1 ? " month." : " months."));
		return done;
	}

	public PlanOrder rejectPlan(Long orderId, String note, String by) {
		if (blank(note)) {
			throw bad("NOTE_REQUIRED", "Tell the seller why.");
		}
		PlanOrder done = tx.execute(s -> {
			PlanOrder o = planOrders.findById(orderId).orElseThrow(() -> ApiException.notFound("Plan request"));
			if (o.getStatus() != PlanOrder.Status.REQUESTED) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_DECIDED", "This request is already decided.");
			}
			o.setStatus(PlanOrder.Status.REJECTED);
			o.setNote(cut(note, 500));
			o.setDecidedBy(by);
			return o;
		});
		sellerSms(done.getShopId(), "Sodo Gebeya: your Pro plan request wasn't accepted: " + cut(note, 120));
		return done;
	}

	/** Every 6 hours: Pro shops whose plan ends within 3 days get one reminder SMS. */
	@Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT5M")
	public int remindRenewals() {
		Instant now = Instant.now();
		List<Shop> due = tx.execute(s -> {
			List<Shop> list = shops.findByPlanAndPlanUntilBetween("PRO", now, now.plus(Duration.ofDays(3))).stream()
					.filter(x -> x.getPlanRemindedAt() == null || x.getPlanRemindedAt().isBefore(x.getPlanUntil().minus(Duration.ofDays(7))))
					.toList();
			list.forEach(x -> x.setPlanRemindedAt(now));
			return list;
		});
		for (Shop x : due) {
			if (!blank(x.getPhone())) {
				sms.send(SmsService.Kind.SHOP, x.getPhone(),
						"Sodo Gebeya: your Pro shop plan ends soon. Renew in Seller > Plan to keep no product limit and lower commission.",
						null, null);
			}
		}
		return due.size();
	}

	/** Free shops can list up to the free limit; Pro shops have none. */
	public void checkProductLimit(Shop shop, long currentCount) {
		if (shop.pro() || !features.on(Features.PRO_PLAN)) {
			return;
		}
		int max = features.integer(Features.FREE_PLAN_MAX_PRODUCTS);
		if (max > 0 && currentCount >= max) {
			throw new ApiException(HttpStatus.CONFLICT, "PLAN_LIMIT",
					"Free shops can have " + max + " products. Remove one, or go Pro for no limit.");
		}
	}

	// ---------- helpers ----------

	private Boost ownBoost(Shop shop, Long id) {
		return boosts.findById(id).filter(b -> shop.getId().equals(b.getShopId())).orElseThrow(() -> ApiException.notFound("Boost"));
	}

	private PlanOrder ownPlan(Shop shop, Long id) {
		return planOrders.findById(id).filter(o -> shop.getId().equals(o.getShopId())).orElseThrow(() -> ApiException.notFound("Plan request"));
	}

	private void sellerSms(Long shopId, String text) {
		if (shopId == null) {
			return;
		}
		shops.findById(shopId).map(Shop::getPhone).filter(p -> !blank(p))
				.ifPresent(phone -> AfterCommit.run(() -> sms.send(SmsService.Kind.SHOP, phone, text, null, null)));
	}

	private static boolean blank(String s) {
		return s == null || s.isBlank();
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}

	private static ApiException bad(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}
}
