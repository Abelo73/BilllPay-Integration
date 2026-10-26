package et.tenapay.shop.promo;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin → Boosts and plans: confirm payments (the boost starts / the plan is extended) or reject with a reason. */
@RestController
@RequestMapping("/api/admin/promo")
@RequiredArgsConstructor
public class PromoAdminController {

	private final PromoService promo;
	private final BoostRepository boosts;
	private final PlanOrderRepository planOrders;
	private final ProductRepository products;
	private final ShopRepository shops;

	public record BoostRow(Long id, Long productId, String productName, String productSlug, Long shopId, String shopName,
			String shopPhone, int days, BigDecimal price, String status, String paymentReference, Instant startsAt, Instant endsAt,
			String note, String decidedBy, Instant createdAt) {
	}

	public record PlanRow(Long id, Long shopId, String shopName, String shopPhone, boolean pro, Instant planUntil, int months,
			BigDecimal price, String status, String paymentReference, String note, String decidedBy, Instant createdAt) {
	}

	public record Decision(@Size(max = 120) String reference, @Size(max = 500) String note) {
	}

	@GetMapping("/counts")
	public Map<String, Long> counts() {
		return Map.of("boosts", boosts.countByStatus(Boost.Status.REQUESTED), "plans", planOrders.countByStatus(PlanOrder.Status.REQUESTED));
	}

	/** {@code show}: waiting (oldest first), active, or done. */
	@GetMapping("/boosts")
	@Transactional(readOnly = true)
	public PageDto<BoostRow> boosts(@RequestParam(defaultValue = "waiting") String show, @RequestParam(defaultValue = "0") int page) {
		EnumSet<Boost.Status> s = switch (show) {
			case "active" -> EnumSet.of(Boost.Status.ACTIVE);
			case "done" -> EnumSet.of(Boost.Status.ENDED, Boost.Status.REJECTED, Boost.Status.CANCELLED);
			default -> EnumSet.of(Boost.Status.REQUESTED);
		};
		Sort sort = "waiting".equals(show) || !"done".equals(show) && !"active".equals(show) ? Sort.by("createdAt").ascending() : Sort.by("createdAt").descending();
		return PageDto.of(boosts.findByStatusIn(s, PageRequest.of(page, 30, sort)).map(this::row));
	}

	@PostMapping("/boosts/{id}/confirm")
	public BoostRow confirmBoost(@PathVariable Long id, @Valid @RequestBody(required = false) Decision d) {
		return row(promo.confirmBoost(id, d == null ? null : d.reference(), by()));
	}

	@PostMapping("/boosts/{id}/reject")
	public BoostRow rejectBoost(@PathVariable Long id, @Valid @RequestBody Decision d) {
		return row(promo.rejectBoost(id, d.note(), by()));
	}

	@GetMapping("/plans")
	@Transactional(readOnly = true)
	public PageDto<PlanRow> plans(@RequestParam(defaultValue = "waiting") String show, @RequestParam(defaultValue = "0") int page) {
		boolean waiting = !"done".equals(show);
		EnumSet<PlanOrder.Status> s = waiting ? EnumSet.of(PlanOrder.Status.REQUESTED)
				: EnumSet.of(PlanOrder.Status.PAID, PlanOrder.Status.REJECTED, PlanOrder.Status.CANCELLED);
		return PageDto.of(planOrders.findByStatusIn(s, PageRequest.of(page, 30,
				waiting ? Sort.by("createdAt").ascending() : Sort.by("createdAt").descending())).map(this::row));
	}

	@PostMapping("/plans/{id}/confirm")
	public PlanRow confirmPlan(@PathVariable Long id, @Valid @RequestBody(required = false) Decision d) {
		return row(promo.confirmPlan(id, d == null ? null : d.reference(), by()));
	}

	@PostMapping("/plans/{id}/reject")
	public PlanRow rejectPlan(@PathVariable Long id, @Valid @RequestBody Decision d) {
		return row(promo.rejectPlan(id, d.note(), by()));
	}

	private BoostRow row(Boost b) {
		var p = products.findById(b.getProductId()).orElse(null);
		Shop shop = b.getShopId() == null ? null : shops.findById(b.getShopId()).orElse(null);
		return new BoostRow(b.getId(), b.getProductId(), p == null ? null : p.getName(), p == null ? null : p.getSlug(), b.getShopId(),
				shop == null ? null : shop.getName(), shop == null ? null : shop.getPhone(), b.getDays(), b.getPrice(), b.getStatus().name(),
				b.getPaymentReference(), b.getStartsAt(), b.getEndsAt(), b.getNote(), b.getDecidedBy(), b.getCreatedAt());
	}

	private PlanRow row(PlanOrder o) {
		Shop shop = shops.findById(o.getShopId()).orElseThrow();
		return new PlanRow(o.getId(), shop.getId(), shop.getName(), shop.getPhone(), shop.pro(), shop.getPlanUntil(), o.getMonths(),
				o.getPrice(), o.getStatus().name(), o.getPaymentReference(), o.getNote(), o.getDecidedBy(), o.getCreatedAt());
	}

	private static String by() {
		return CurrentUser.get().map(CurrentUser::email).orElse("staff");
	}
}
