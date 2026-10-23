package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentService;
import et.tenapay.shop.payment.PaymentStatus;
import et.tenapay.shop.payment.billpay.BillPayException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CheckoutController {

	/** Minimum gap between on-demand BillPay status checks triggered by the return page. */
	private static final Duration ON_DEMAND_CHECK_GAP = Duration.ofSeconds(10);

	private final CheckoutService checkout;
	private final PaymentService payments;
	private final OrderRepository orders;
	private final PaymentAttemptRepository attempts;
	private final TransactionTemplate tx;

	public record CheckoutItem(@NotNull Long productId, @Min(1) @Max(20) int quantity) {
	}

	public record CustomerRequest(
			@NotBlank @Size(max = 200) String name,
			@NotBlank @Pattern(regexp = "^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone,
			@NotBlank @Email @Size(max = 200) String email) {
	}

	public record CheckoutRequest(@NotEmpty @Size(max = 30) List<@Valid CheckoutItem> items,
			@NotNull @Valid CustomerRequest customer) {
	}

	public record CheckoutResponse(String orderNumber, String checkoutUrl) {
	}

	public record PayRequest(@NotBlank String phone) {
	}

	public record ItemView(String productName, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {
	}

	public record PaymentView(int attemptNo, String status, String reasonCode, String paymentMethod) {
	}

	public record OrderStatusView(String orderNumber, String status, BigDecimal total, String currency,
			String customerName, List<ItemView> items, PaymentView payment, boolean canRetry, Instant createdAt,
			Instant paidAt) {
	}

	@PostMapping("/checkout")
	public CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest req) {
		Order order = checkout.createOrder(
				req.items().stream().map(i -> new CheckoutService.Line(i.productId(), i.quantity())).toList(),
				new CheckoutService.CustomerInfo(req.customer().name(), req.customer().phone(), req.customer().email()));
		return new CheckoutResponse(order.getOrderNumber(), startPayment(order));
	}

	@PostMapping("/orders/{orderNumber}/pay")
	public CheckoutResponse pay(@PathVariable String orderNumber, @Valid @RequestBody PayRequest req) {
		Order order = findOwned(orderNumber, req.phone());
		return new CheckoutResponse(order.getOrderNumber(), startPayment(order));
	}

	@GetMapping("/orders/{orderNumber}/status")
	public OrderStatusView status(@PathVariable String orderNumber, @RequestParam String phone) {
		Order order = findOwned(orderNumber, phone);
		attempts.findFirstByOrderIdOrderByAttemptNoDesc(order.getId())
				.filter(a -> order.getStatus() == OrderStatus.PENDING_PAYMENT && dueForOnDemandCheck(a))
				.ifPresent(a -> payments.reconcile(a.getId()));
		return tx.execute(s -> view(orders.findByOrderNumber(orderNumber).orElseThrow()));
	}

	private String startPayment(Order order) {
		try {
			return payments.startPayment(order.getId());
		} catch (BillPayException e) {
			log.error("Could not start BillPay payment for {}: {}", order.getOrderNumber(), e.getMessage());
			throw new ApiException(HttpStatus.BAD_GATEWAY, "PAYMENT_PROVIDER_ERROR",
					"We couldn't reach the payment provider. Your order is saved; please try paying again.",
					Map.of("orderNumber", order.getOrderNumber()));
		}
	}

	private boolean dueForOnDemandCheck(PaymentAttempt a) {
		Instant now = Instant.now();
		return a.getStatus() == PaymentStatus.PENDING && a.getBillpayPaymentId() != null
				&& a.getCreatedAt().isBefore(now.minusSeconds(15))
				&& (a.getLastCheckedAt() == null || a.getLastCheckedAt().isBefore(now.minus(ON_DEMAND_CHECK_GAP)));
	}

	private Order findOwned(String orderNumber, String phone) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		if (!CheckoutService.samePhone(order.getCustomerPhone(), phone)) {
			// Same response as a missing order, so order numbers can't be probed.
			throw ApiException.notFound("Order");
		}
		return order;
	}

	private OrderStatusView view(Order order) {
		PaymentView payment = attempts.findFirstByOrderIdOrderByAttemptNoDesc(order.getId())
				.map(a -> new PaymentView(a.getAttemptNo(), a.getStatus().name(), a.getReasonCode(), a.getPaymentMethod()))
				.orElse(null);
		return new OrderStatusView(order.getOrderNumber(), order.getStatus().name(), order.getTotal(),
				order.getCurrency(), order.getCustomerName(),
				order.getItems().stream()
						.map(i -> new ItemView(i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
						.toList(),
				payment, order.getStatus().awaitingPayment(), order.getCreatedAt(), order.getPaidAt());
	}
}
