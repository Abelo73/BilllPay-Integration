package et.tenapay.shop.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.discount.DiscountCode;
import et.tenapay.shop.discount.DiscountCodeRepository;
import et.tenapay.shop.discount.DiscountService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin: discount codes. Codes are never deleted (orders refer to them); switch them off instead. */
@RestController
@RequestMapping("/api/admin/discounts")
@RequiredArgsConstructor
public class DiscountAdminController {

	private final DiscountCodeRepository codes;
	private final JdbcTemplate jdbc;

	public record CreateRequest(
			@NotNull @Pattern(regexp = "^[A-Za-z0-9_-]{3,40}$", message = "3–40 letters, digits, - or _") String code,
			@Size(max = 200) String description,
			@NotNull DiscountCode.Kind kind,
			@NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal value,
			@DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal maxDiscount,
			@DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal minSubtotal,
			Instant startsAt,
			Instant expiresAt,
			@Min(1) Integer usageLimit) {
	}

	/** Only what's safe to change once orders may have used the code. */
	public record UpdateRequest(@Size(max = 200) String description, Boolean active, Instant expiresAt,
			Boolean clearExpiry, @Min(1) Integer usageLimit, Boolean clearUsageLimit) {
	}

	public record DiscountRow(Long id, String code, String description, String kind, BigDecimal value,
			BigDecimal maxDiscount, BigDecimal minSubtotal, Instant startsAt, Instant expiresAt, Integer usageLimit,
			int timesUsed, boolean active, String state, long paidOrders, BigDecimal discountGiven, BigDecimal revenue,
			Instant createdAt) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public List<DiscountRow> list() {
		Map<String, Object[]> stats = new HashMap<>();
		jdbc.query("""
				select discount_code, count(*) as n, coalesce(sum(discount_amount), 0) as given, coalesce(sum(total), 0) as revenue
				from orders where discount_code is not null and paid_at is not null group by discount_code
				""", rs -> {
			stats.put(rs.getString(1), new Object[] { rs.getLong(2), rs.getBigDecimal(3), rs.getBigDecimal(4) });
		});
		Instant now = Instant.now();
		return codes.findAllByOrderByCreatedAtDesc().stream().map(d -> {
			Object[] s = stats.getOrDefault(d.getCode(), new Object[] { 0L, BigDecimal.ZERO, BigDecimal.ZERO });
			String problem = d.problem(BigDecimal.valueOf(Long.MAX_VALUE), now);
			return new DiscountRow(d.getId(), d.getCode(), d.getDescription(), d.getKind().name(), d.getValue(),
					d.getMaxDiscount(), d.getMinSubtotal(), d.getStartsAt(), d.getExpiresAt(), d.getUsageLimit(),
					d.getTimesUsed(), d.isActive(), problem == null ? "LIVE" : problem, (Long) s[0], (BigDecimal) s[1],
					(BigDecimal) s[2], d.getCreatedAt());
		}).toList();
	}

	@PostMapping
	@Transactional
	public List<DiscountRow> create(@Valid @RequestBody CreateRequest req) {
		String code = DiscountService.normalize(req.code());
		if (codes.existsByCode(code)) {
			throw new ApiException(HttpStatus.CONFLICT, "CODE_TAKEN", "There is already a code " + code + ".");
		}
		if (req.kind() == DiscountCode.Kind.PERCENT && req.value().compareTo(BigDecimal.valueOf(100)) > 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_VALUE", "A percentage can't be more than 100.");
		}
		if (req.startsAt() != null && req.expiresAt() != null && !req.expiresAt().isAfter(req.startsAt())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DATES", "The code must end after it starts.");
		}
		DiscountCode d = new DiscountCode();
		d.setCode(code);
		d.setDescription(blankToNull(req.description()));
		d.setKind(req.kind());
		d.setValue(req.value());
		d.setMaxDiscount(req.kind() == DiscountCode.Kind.PERCENT ? req.maxDiscount() : null);
		d.setMinSubtotal(req.minSubtotal() == null ? BigDecimal.ZERO : req.minSubtotal());
		d.setStartsAt(req.startsAt());
		d.setExpiresAt(req.expiresAt());
		d.setUsageLimit(req.usageLimit());
		codes.save(d);
		return list();
	}

	@PatchMapping("/{id}")
	@Transactional
	public List<DiscountRow> update(@PathVariable Long id, @Valid @RequestBody UpdateRequest req) {
		DiscountCode d = codes.findById(id).orElseThrow(() -> ApiException.notFound("Discount code"));
		if (req.description() != null) {
			d.setDescription(blankToNull(req.description()));
		}
		if (req.active() != null) {
			d.setActive(req.active());
		}
		if (Boolean.TRUE.equals(req.clearExpiry())) {
			d.setExpiresAt(null);
		} else if (req.expiresAt() != null) {
			d.setExpiresAt(req.expiresAt());
		}
		if (Boolean.TRUE.equals(req.clearUsageLimit())) {
			d.setUsageLimit(null);
		} else if (req.usageLimit() != null) {
			d.setUsageLimit(req.usageLimit());
		}
		return list();
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}
}
