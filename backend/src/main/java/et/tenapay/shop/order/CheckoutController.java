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
import et.tenapay.shop.user.CurrentUser;
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
	private final FulfilmentService fulfilment;
	private final OrderEventRepository orderEvents;
	private final et.tenapay.shop.user.CustomerAddressRepository addresses;
	private final et.tenapay.shop.config.AppProperties app;

	public record CheckoutItem(@NotNull Long productId, @Min(1) @Max(20) int quantity) {
	}

	public record CustomerRequest(
			@NotBlank @Size(max = 200) String name,
			@NotBlank @Pattern(regexp = "^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone,
			@NotBlank @Email @Size(max = 200) String email) {
	}

	public record DeliveryRequest(
			@NotBlank @Size(max = 300) String address,
			@NotBlank @Size(max = 100) String city,
			@Size(max = 300) String notes) {
	}

	public record CheckoutRequest(@NotEmpty @Size(max = 30) List<@Valid CheckoutItem> items,
			@NotNull @Valid CustomerRequest customer,
			@NotNull @Valid DeliveryRequest delivery,
			/** Signed-in customers: also save this address to their address book. */
			Boolean saveAddress,
			@Size(max = 40) String discountCode) {
	}

	public record QuoteRequest(@NotEmpty @Size(max = 30) List<@Valid CheckoutItem> items,
			@NotBlank @Size(max = 40) String code) {
	}

	public record CheckoutResponse(String orderNumber, String checkoutUrl) {
	}

	public record PayRequest(String phone) {
	}

	public record CancelRequest(String phone, @Size(max = 300) String reason) {
	}

	public record DeliveryQuote(BigDecimal flatFee, BigDecimal freeOver, String currency) {
	}

	public record ItemView(String productName, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {
	}

	public record PaymentView(int attemptNo, String status, String reasonCode, String paymentMethod) {
	}

	public record DeliveryView(String address, String city, String notes, String fulfilmentStatus, String trackingNote,
			Instant shippedAt, Instant deliveredAt) {
	}

	/** One customer-visible step of the order (internal details are left out). */
	public record StepView(String type, Instant at) {
	}

	public record OrderStatusView(String orderNumber, String status, BigDecimal subtotal, String discountCode,
			BigDecimal discountAmount, BigDecimal deliveryFee, BigDecimal total, String currency, String customerName, List<ItemView> items, PaymentView payment,
			boolean canRetry, boolean canCancel, DeliveryView delivery, List<StepView> timeline, Instant createdAt,
			Instant paidAt) {
	}

	private static final java.util.Set<String> CUSTOMER_STEPS = java.util.Set.of("ORDER_CREATED", "PAID", "EXPIRED",
			"CANCELLED", "PAYMENT_FAILED", "FULFILMENT_PROCESSING", "FULFILMENT_SHIPPED", "FULFILMENT_DELIVERED",
			"FULFILMENT_CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED");

	@GetMapping("/delivery")
	public DeliveryQuote delivery() {
		return new DeliveryQuote(app.delivery().flatFee(), app.delivery().freeOver(), "ETB");
	}

	/** Checks a discount code against the cart and returns what the order would cost. Nothing is used up. */
	@PostMapping("/discounts/check")
	public CheckoutService.Quote checkDiscount(@Valid @RequestBody QuoteRequest req) {
		return checkout.quote(req.items().stream().map(i -> new CheckoutService.Line(i.productId(), i.quantity())).toList(),
				req.code());
	}

	@PostMapping("/checkout")
	public CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest req) {
		java.util.UUID customerId = CurrentUser.customerId().orElse(null);
		Order order = checkout.createOrder(
				req.items().stream().map(i -> new CheckoutService.Line(i.productId(), i.quantity())).toList(),
				new CheckoutService.CustomerInfo(req.customer().name(), req.customer().phone(), req.customer().email()),
				new CheckoutService.DeliveryInfo(req.delivery().address(), req.delivery().city(), req.delivery().notes()),
				customerId, req.discountCode());
		if (customerId != null && Boolean.TRUE.equals(req.saveAddress())) {
			saveAddress(customerId, req);
		}
		return new CheckoutResponse(order.getOrderNumber(), startPayment(order));
	}

	@PostMapping("/orders/{orderNumber}/pay")
	public CheckoutResponse pay(@PathVariable String orderNumber, @RequestBody(required = false) PayRequest req) {
		Order order = findOwned(orderNumber, req == null ? null : req.phone());
		return new CheckoutResponse(order.getOrderNumber(), startPayment(order));
	}

	/** The shopper cancels an order they haven't paid for; its items go back on sale. */
	@PostMapping("/orders/{orderNumber}/cancel")
	public OrderStatusView cancel(@PathVariable String orderNumber, @Valid @RequestBody(required = false) CancelRequest req) {
		Order order = findOwned(orderNumber, req == null ? null : req.phone());
		fulfilment.cancelUnpaid(order.getOrderNumber(), req == null ? null : req.reason(), "customer");
		return tx.execute(s -> view(orders.findByOrderNumber(orderNumber).orElseThrow()));
	}

	private void saveAddress(java.util.UUID customerId, CheckoutRequest req) {
		tx.executeWithoutResult(s -> {
			var existing = addresses.findByUserIdOrderByDefaultAddressDescCreatedAtAsc(customerId);
			boolean known = existing.stream().anyMatch(a -> a.getAddressLine().equalsIgnoreCase(req.delivery().address().trim())
					&& a.getCity().equalsIgnoreCase(req.delivery().city().trim()));
			if (known || existing.size() >= et.tenapay.shop.user.AddressController.MAX_ADDRESSES) {
				return;
			}
			var a = new et.tenapay.shop.user.CustomerAddress();
			a.setUserId(customerId);
			a.setLabel(existing.isEmpty() ? "Home" : "Address " + (existing.size() + 1));
			a.setRecipientName(req.customer().name().trim());
			a.setPhone(CheckoutService.normalizePhone(req.customer().phone()));
			a.setAddressLine(req.delivery().address().trim());
			a.setCity(req.delivery().city().trim());
			a.setNotes(req.delivery().notes() == null || req.delivery().notes().isBlank() ? null : req.delivery().notes().trim());
			a.setDefaultAddress(existing.isEmpty());
			addresses.save(a);
		});
	}

	/** Guests prove ownership with the checkout phone; signed-in customers can open their own orders without it. */
	@GetMapping("/orders/{orderNumber}/status")
	public OrderStatusView status(@PathVariable String orderNumber, @RequestParam(required = false) String phone) {
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
		boolean ownedBySignedInCustomer = order.getUserId() != null
				&& CurrentUser.customerId().filter(order.getUserId()::equals).isPresent();
		if (!ownedBySignedInCustomer && !CheckoutService.samePhone(order.getCustomerPhone(), phone)) {
			// Same response as a missing order, so order numbers can't be probed.
			throw ApiException.notFound("Order");
		}
		return order;
	}

	private OrderStatusView view(Order order) {
		PaymentView payment = attempts.findFirstByOrderIdOrderByAttemptNoDesc(order.getId())
				.map(a -> new PaymentView(a.getAttemptNo(), a.getStatus().name(), a.getReasonCode(), a.getPaymentMethod()))
				.orElse(null);
		DeliveryView delivery = new DeliveryView(order.getDeliveryAddress(), order.getDeliveryCity(),
				order.getDeliveryNotes(), order.getFulfilmentStatus() == null ? null : order.getFulfilmentStatus().name(),
				order.getTrackingNote(), order.getShippedAt(), order.getDeliveredAt());
		List<StepView> timeline = orderEvents.findByOrderIdOrderByCreatedAtAscIdAsc(order.getId()).stream()
				.filter(e -> CUSTOMER_STEPS.contains(e.getType()))
				.map(e -> new StepView(e.getType(), e.getCreatedAt()))
				.toList();
		return new OrderStatusView(order.getOrderNumber(), order.getStatus().name(), order.getSubtotal(),
				order.getDiscountCode(), order.getDiscountAmount(), order.getDeliveryFee(), order.getTotal(), order.getCurrency(), order.getCustomerName(),
				order.getItems().stream()
						.map(i -> new ItemView(i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
						.toList(),
				payment, order.getStatus().awaitingPayment(), order.getStatus().awaitingPayment(), delivery, timeline,
				order.getCreatedAt(), order.getPaidAt());
	}
}
