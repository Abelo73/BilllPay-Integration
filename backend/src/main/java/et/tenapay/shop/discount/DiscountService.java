package et.tenapay.shop.discount;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Discount codes. A use is held when an order is placed (like stock), kept when it's paid, and released when the
 * order is cancelled or expires, so a limited code can't be oversold by unpaid orders.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DiscountService {

	private static final Map<String, String> MESSAGES = Map.of(
			"UNKNOWN", "That discount code doesn't exist.",
			"INACTIVE", "That discount code is no longer active.",
			"NOT_STARTED", "That discount code isn't valid yet.",
			"EXPIRED", "That discount code has expired.",
			"USED_UP", "That discount code has been used up.",
			"BELOW_MINIMUM", "Your cart is below the minimum for this code.");

	private final DiscountCodeRepository codes;

	public record Applied(String code, String description, BigDecimal amount) {
	}

	public static String normalize(String code) {
		return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
	}

	/** Checks a code against a subtotal without using it. */
	@Transactional(readOnly = true)
	public Applied quote(String rawCode, BigDecimal subtotal) {
		String code = normalize(rawCode);
		DiscountCode d = codes.findByCode(code).orElseThrow(() -> invalid("UNKNOWN", null));
		check(d, subtotal);
		return new Applied(d.getCode(), d.getDescription(), d.discountFor(subtotal));
	}

	/** Takes one use of the code for a new order. Runs inside the checkout transaction. */
	@Transactional(propagation = Propagation.MANDATORY)
	public Applied use(String rawCode, BigDecimal subtotal) {
		String code = normalize(rawCode);
		DiscountCode d = codes.lockByCode(code).orElseThrow(() -> invalid("UNKNOWN", null));
		check(d, subtotal);
		d.setTimesUsed(d.getTimesUsed() + 1);
		return new Applied(d.getCode(), d.getDescription(), d.discountFor(subtotal));
	}

	/** Gives the use back when an unpaid order is cancelled or expires. */
	@Transactional(propagation = Propagation.MANDATORY)
	public void release(String code) {
		if (code == null) {
			return;
		}
		codes.lockByCode(code).ifPresent(d -> d.setTimesUsed(Math.max(0, d.getTimesUsed() - 1)));
	}

	private static void check(DiscountCode d, BigDecimal subtotal) {
		String problem = d.problem(subtotal, Instant.now());
		if (problem != null) {
			throw invalid(problem, d);
		}
	}

	private static ApiException invalid(String reason, DiscountCode d) {
		String message = MESSAGES.getOrDefault(reason, "That discount code can't be used.");
		if ("BELOW_MINIMUM".equals(reason) && d != null) {
			message = "This code needs a cart of at least ETB " + d.getMinSubtotal().toPlainString() + ".";
		}
		return new ApiException(HttpStatus.BAD_REQUEST, "DISCOUNT_INVALID", message, Map.of("reason", reason));
	}
}
