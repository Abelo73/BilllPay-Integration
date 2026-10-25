package et.tenapay.shop.payout;

import java.io.IOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.Category;
import et.tenapay.shop.catalog.CategoryRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.user.CurrentUser;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Staff: payout requests, money totals, CSV for accounting, and commission rules (Admin → Payouts, Admin → Fees). */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class PayoutAdminController {

	private static final ZoneId ADDIS = ZoneId.of("Africa/Addis_Ababa");

	private final PayoutRepository payouts;
	private final PayoutService service;
	private final CommissionRuleRepository rules;
	private final ShopRepository shops;
	private final CategoryRepository categories;
	private final OrderParcelRepository parcels;

	public record PayoutRow(Long id, Long shopId, String shopName, String shopPhone, BigDecimal amount, String status,
			String method, String provider, String accountName, String account, String reference, String note,
			String requestedBy, String decidedBy, Instant requestedAt, Instant decidedAt, BigDecimal shopAvailable) {
	}

	/** {@code held}: buyers' money waiting for delivery; {@code available}: sellers can withdraw it; {@code commission}: ours. */
	public record Totals(BigDecimal held, BigDecimal available, BigDecimal requested, long requestedCount,
			BigDecimal paidOut, BigDecimal commission) {
	}

	public record PayoutList(Totals totals, PageDto<PayoutRow> page) {
	}

	public record DecisionRequest(@NotNull PayoutStatus status, @Size(max = 120) String reference, @Size(max = 500) String note) {
	}

	public record RuleRow(Long id, Long shopId, String shopName, Long categoryId, String categoryName, BigDecimal percent,
			String note, String updatedBy, Instant updatedAt) {
	}

	public record RuleRequest(Long shopId, Long categoryId,
			@NotNull @DecimalMin("0") @DecimalMax("50") BigDecimal percent, @Size(max = 200) String note) {
	}

	// ---------- payouts ----------

	@GetMapping("/payouts")
	@Transactional(readOnly = true)
	public PayoutList list(@RequestParam(defaultValue = "REQUESTED") PayoutStatus status, @RequestParam(defaultValue = "0") int page) {
		Sort sort = status == PayoutStatus.REQUESTED ? Sort.by("requestedAt").ascending() : Sort.by("requestedAt").descending();
		var result = payouts.findByStatus(status, PageRequest.of(page, 20, sort));
		Map<Long, Shop> byId = new HashMap<>();
		shops.findAllById(result.getContent().stream().map(Payout::getShopId).distinct().toList()).forEach(s -> byId.put(s.getId(), s));
		return new PayoutList(totals(), PageDto.of(result.map(p -> {
			Shop s = byId.get(p.getShopId());
			return new PayoutRow(p.getId(), p.getShopId(), s == null ? null : s.getName(), s == null ? null : s.getPhone(),
					p.getAmount(), p.getStatus().name(), p.getMethod(), p.getProvider(), p.getAccountName(), p.getAccount(),
					p.getReference(), p.getNote(), p.getRequestedBy(), p.getDecidedBy(), p.getRequestedAt(), p.getDecidedAt(),
					service.balance(p.getShopId()).available());
		})));
	}

	@PostMapping("/payouts/{id}/decision")
	public Map<String, Object> decide(@PathVariable Long id, @Valid @RequestBody DecisionRequest req) {
		Payout p = service.decide(id, req.status(), req.reference(), req.note(), by());
		return Map.of("id", p.getId(), "status", p.getStatus().name());
	}

	/** Releases what's due now instead of waiting for the hourly run (useful while testing). */
	@PostMapping("/payouts/release-due")
	public Map<String, Object> releaseDue() {
		return Map.of("released", service.releaseDue());
	}

	@GetMapping("/payouts.csv")
	@Transactional(readOnly = true)
	public void csv(HttpServletResponse response) throws IOException {
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sodo-gebeya-payouts-"
				+ DateTimeFormatter.BASIC_ISO_DATE.format(Instant.now().atZone(ADDIS)) + ".csv\"");
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		Writer out = response.getWriter();
		out.write('﻿'); // lets Excel detect UTF-8
		out.write("payout_id,shop,amount_etb,status,method,provider,account_name,account,reference,requested_at,decided_at,decided_by\r\n");
		Map<Long, String> names = new HashMap<>();
		shops.findAll().forEach(s -> names.put(s.getId(), s.getName()));
		for (Payout p : payouts.findAll(Sort.by("requestedAt").descending())) {
			out.write(String.join(",", String.valueOf(p.getId()), cell(names.get(p.getShopId())), p.getAmount().toPlainString(),
					p.getStatus().name(), cell(p.getMethod()), cell(p.getProvider()), cell(p.getAccountName()), cell(p.getAccount()),
					cell(p.getReference()), time(p.getRequestedAt()), time(p.getDecidedAt()), cell(p.getDecidedBy())) + "\r\n");
		}
		out.flush();
	}

	// ---------- commission rules ----------

	@GetMapping("/commission-rules")
	@Transactional(readOnly = true)
	public List<RuleRow> rules() {
		Map<Long, String> shopNames = new HashMap<>();
		Map<Long, String> catNames = new HashMap<>();
		List<CommissionRule> all = rules.findAllByOrderByIdAsc();
		shops.findAllById(all.stream().map(CommissionRule::getShopId).filter(java.util.Objects::nonNull).toList())
				.forEach(s -> shopNames.put(s.getId(), s.getName()));
		categories.findAll().forEach((Category c) -> catNames.put(c.getId(), c.getName()));
		return all.stream().map(r -> new RuleRow(r.getId(), r.getShopId(), shopNames.get(r.getShopId()), r.getCategoryId(),
				catNames.get(r.getCategoryId()), r.getPercent(), r.getNote(), r.getUpdatedBy(), r.getUpdatedAt())).toList();
	}

	/** Creates or changes the rule for this seller/category scope (both empty = the default for everyone). */
	@PutMapping("/commission-rules")
	@Transactional
	public List<RuleRow> saveRule(@Valid @RequestBody RuleRequest req) {
		if (req.shopId() != null && !shops.existsById(req.shopId())) {
			throw ApiException.notFound("Shop");
		}
		if (req.categoryId() != null && !categories.existsById(req.categoryId())) {
			throw ApiException.notFound("Category");
		}
		CommissionRule r = rules.findScope(req.shopId(), req.categoryId()).orElseGet(CommissionRule::new);
		r.setShopId(req.shopId());
		r.setCategoryId(req.categoryId());
		r.setPercent(req.percent().setScale(2, java.math.RoundingMode.HALF_UP));
		r.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
		r.setUpdatedBy(by());
		r.setUpdatedAt(Instant.now());
		rules.save(r);
		return rules();
	}

	@DeleteMapping("/commission-rules/{id}")
	@Transactional
	public List<RuleRow> deleteRule(@PathVariable Long id) {
		CommissionRule r = rules.findById(id).orElseThrow(() -> ApiException.notFound("Rule"));
		if (r.getShopId() == null && r.getCategoryId() == null) {
			throw new ApiException(HttpStatus.CONFLICT, "DEFAULT_RULE", "The default rule can't be removed; set it to 0% instead.");
		}
		rules.delete(r);
		return rules();
	}

	// ---------- helpers ----------

	private Totals totals() {
		Object[] t = parcels.platformTotals().get(0);
		BigDecimal released = (BigDecimal) t[1];
		BigDecimal requested = payouts.sumByStatus(PayoutStatus.REQUESTED);
		BigDecimal paid = payouts.sumByStatus(PayoutStatus.PAID);
		return new Totals((BigDecimal) t[0], released.subtract(requested).subtract(paid), requested,
				payouts.countByStatus(PayoutStatus.REQUESTED), paid, (BigDecimal) t[2]);
	}

	private static String by() {
		return CurrentUser.get().map(CurrentUser::email).orElse("staff");
	}

	private static String time(Instant t) {
		return t == null ? "" : DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(t.atZone(ADDIS));
	}

	/** Quoted CSV text; a leading = + - @ is neutralised so spreadsheets don't run it as a formula. */
	static String cell(String s) {
		if (s == null) {
			return "";
		}
		String v = !s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0 && !s.matches("\\+[0-9 ]{6,20}") ? "'" + s : s;
		return "\"" + v.replace("\"", "\"\"") + "\"";
	}
}
