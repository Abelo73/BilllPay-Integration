package et.tenapay.shop.promo;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Seller → Plan: boost listings (M16), the Pro plan (M17) and, for Pro shops, statistics per product. */
@RestController
@RequestMapping("/api/seller/promo")
@RequiredArgsConstructor
public class SellerPromoController {

	private final PromoService promo;
	private final ShopService shops;
	private final BoostRepository boosts;
	private final PlanOrderRepository planOrders;
	private final ProductRepository products;
	private final Features features;
	private final JdbcTemplate jdbc;

	public record BoostView(Long id, Long productId, String productName, int days, BigDecimal price, String status,
			String paymentReference, Instant startsAt, Instant endsAt, String note, Instant createdAt) {
	}

	public record PlanOrderView(Long id, int months, BigDecimal price, String status, String paymentReference, String note,
			Instant createdAt) {
	}

	/** {@code payTo}: Sodo Gebeya's number for telebirr / bank (Admin → Features → support phone). */
	public record Overview(boolean pro, String plan, Instant planUntil, long products, Integer productLimit,
			BigDecimal planPricePerMonth, BigDecimal commissionOff, Map<Integer, BigDecimal> boostPrices, String payTo,
			boolean boostsOn, boolean planOn, List<BoostView> boosts, List<PlanOrderView> planOrders) {
	}

	public record BoostRequest(@NotNull Long productId, int days, @Size(max = 120) String reference) {
	}

	public record PlanRequest(int months, @Size(max = 120) String reference) {
	}

	public record ReferenceRequest(@NotNull @Size(min = 3, max = 120) String reference) {
	}

	public record ProductStats(Long productId, String name, boolean boosted, long phoneReveals, long chats, long offers) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public Overview overview() {
		Shop shop = shops.requireMine();
		long count = ((Number) products.shopCounts(shop.getId()).get(0)[0]).longValue();
		Map<Integer, BigDecimal> prices = new LinkedHashMap<>();
		for (int d : new int[] { 3, 7, 14 }) {
			prices.put(d, promo.boostPrice(d));
		}
		String payTo = features.text(Features.SUPPORT_PHONE);
		return new Overview(shop.pro(), shop.getPlan(), shop.getPlanUntil(), count,
				shop.pro() || !features.on(Features.PRO_PLAN) ? null : features.integer(Features.FREE_PLAN_MAX_PRODUCTS),
				features.number(Features.PRO_PLAN_PRICE), features.number(Features.PRO_COMMISSION_OFF), prices,
				payTo == null || payTo.isBlank() ? null : payTo, features.on(Features.BOOSTS), features.on(Features.PRO_PLAN),
				boosts.findByShopIdOrderByIdDesc(shop.getId()).stream().limit(30).map(this::view).toList(),
				planOrders.findByShopIdOrderByIdDesc(shop.getId()).stream().limit(12)
						.map(o -> new PlanOrderView(o.getId(), o.getMonths(), o.getPrice(), o.getStatus().name(), o.getPaymentReference(), o.getNote(),
								o.getCreatedAt()))
						.toList());
	}

	@PostMapping("/boosts")
	public Overview boost(@Valid @RequestBody BoostRequest r) {
		promo.requestBoost(shops.requireMine(), r.productId(), r.days(), r.reference());
		return overview();
	}

	@PostMapping("/boosts/{id}/reference")
	public Overview boostReference(@PathVariable Long id, @Valid @RequestBody ReferenceRequest r) {
		promo.boostReference(shops.requireMine(), id, r.reference());
		return overview();
	}

	@PostMapping("/boosts/{id}/cancel")
	public Overview cancelBoost(@PathVariable Long id) {
		promo.cancelBoost(shops.requireMine(), id);
		return overview();
	}

	@PostMapping("/plan")
	public Overview plan(@Valid @RequestBody PlanRequest r) {
		promo.requestPlan(shops.requireMine(), r.months(), r.reference());
		return overview();
	}

	@PostMapping("/plan/{id}/reference")
	public Overview planReference(@PathVariable Long id, @Valid @RequestBody ReferenceRequest r) {
		promo.planReference(shops.requireMine(), id, r.reference());
		return overview();
	}

	@PostMapping("/plan/{id}/cancel")
	public Overview cancelPlan(@PathVariable Long id) {
		promo.cancelPlan(shops.requireMine(), id);
		return overview();
	}

	/** Pro shops: last 30 days per product (phone numbers shown, chats started, price offers). */
	@GetMapping("/stats")
	@Transactional(readOnly = true)
	public List<ProductStats> stats() {
		Shop shop = shops.requireMine();
		if (!shop.pro()) {
			throw new ApiException(HttpStatus.FORBIDDEN, "PRO_ONLY", "Statistics come with the Pro shop plan.");
		}
		return jdbc.query("""
				select p.id, p.name, (p.boosted_until > now()) as boosted,
				  (select count(*) from contact_reveals r where r.product_id = p.id and r.created_at > now() - interval '30 days') as reveals,
				  (select count(*) from conversations c where c.product_id = p.id and c.created_at > now() - interval '30 days') as chats,
				  (select count(*) from chat_offers o where o.product_id = p.id and o.created_at > now() - interval '30 days') as offers
				from products p where p.shop_id = ?
				order by reveals desc, chats desc, p.id desc limit 100
				""", (rs, i) -> new ProductStats(rs.getLong(1), rs.getString(2), rs.getBoolean(3), rs.getLong(4), rs.getLong(5), rs.getLong(6)),
				shop.getId());
	}

	private BoostView view(Boost b) {
		String name = products.findById(b.getProductId()).map(p -> p.getName()).orElse("Product");
		return new BoostView(b.getId(), b.getProductId(), name, b.getDays(), b.getPrice(), b.getStatus().name(), b.getPaymentReference(),
				b.getStartsAt(), b.getEndsAt(), b.getNote(), b.getCreatedAt());
	}
}
