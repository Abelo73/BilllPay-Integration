package et.tenapay.shop.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderEvent;
import et.tenapay.shop.order.OrderEventRepository;
import et.tenapay.shop.order.OrderItem;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderStatus;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentService;
import et.tenapay.shop.payment.PaymentStatus;
import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.payment.billpay.BillPayProperties;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.refund.Refund;
import et.tenapay.shop.refund.RefundRepository;
import et.tenapay.shop.refund.RefundService;
import et.tenapay.shop.refund.RefundStatus;
import et.tenapay.shop.webhook.WebhookEvent;
import et.tenapay.shop.webhook.WebhookEventRepository;
import et.tenapay.shop.webhook.WebhookPublisher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

	private final OrderRepository orders;
	private final OrderEventRepository orderEvents;
	private final PaymentAttemptRepository attempts;
	private final WebhookEventRepository webhooks;
	private final RefundRepository refundRepo;
	private final PaymentService payments;
	private final RefundService refunds;
	private final WebhookPublisher webhookPublisher;
	private final BillPayProperties billPay;
	private final BillPayMode billPayMode;
	private final AppProperties app;
	private final et.tenapay.shop.notification.NotificationRepository notificationRepo;
	private final et.tenapay.shop.order.OrderParcelRepository parcelRepo;
	private final et.tenapay.shop.seller.ShopRepository shopRepo;
	private final et.tenapay.shop.delivery.RiderRepository riderRepo;

	public record OrderRow(UUID id, String orderNumber, String status, String fulfilmentStatus, BigDecimal total,
			String currency, String customerName, String customerPhone, String deliveryCity, Instant createdAt,
			Instant paidAt, String environment,
			/** BILLPAY or CASH (paid to the seller at the door) */
			String paymentMethod) {

		static OrderRow from(Order o) {
			return new OrderRow(o.getId(), o.getOrderNumber(), o.getStatus().name(),
					o.getFulfilmentStatus() == null ? null : o.getFulfilmentStatus().name(), o.getTotal(),
					o.getCurrency(), o.getCustomerName(), o.getCustomerPhone(), o.getDeliveryCity(), o.getCreatedAt(),
					o.getPaidAt(), o.getEnvironment().name(), o.cash() ? "CASH" : "BILLPAY");
		}
	}

	public record DeliveryDetail(String address, String city, String notes, BigDecimal subtotal, String discountCode,
			BigDecimal discountAmount, BigDecimal deliveryFee,
			String fulfilmentStatus, List<String> nextSteps, String trackingNote, Instant shippedAt,
			Instant deliveredAt, Instant cancelledAt,
			/** Area of Sodo picked at checkout (M21) */
			String area) {

		static DeliveryDetail from(Order o) {
			return new DeliveryDetail(o.getDeliveryAddress(), o.getDeliveryCity(), o.getDeliveryNotes(), o.getSubtotal(),
					o.getDiscountCode(), o.getDiscountAmount(),
					o.getDeliveryFee(), o.getFulfilmentStatus() == null ? null : o.getFulfilmentStatus().name(),
					o.getFulfilmentStatus() == null ? List.of()
							: o.getFulfilmentStatus().next().stream().map(Enum::name).sorted().toList(),
					o.getTrackingNote(), o.getShippedAt(), o.getDeliveredAt(), o.getCancelledAt(), o.getDeliveryArea());
		}
	}

	public record AttemptView(UUID id, String orderNumber, int attemptNo, String merchantReference,
			String idempotencyKey, String billpayPaymentId, String checkoutUrl, String status, BigDecimal amount,
			BigDecimal refundable, String paymentMethod, String reasonCode, String error, String requestPayload,
			String responsePayload, Instant expiresAt, Instant lastCheckedAt, Instant createdAt) {

		static AttemptView from(PaymentAttempt a, String orderNumber, BigDecimal refundable) {
			return new AttemptView(a.getId(), orderNumber, a.getAttemptNo(), a.getMerchantReference(),
					a.getIdempotencyKey().toString(), a.getBillpayPaymentId(), a.getCheckoutUrl(), a.getStatus().name(),
					a.getAmount(), refundable, a.getPaymentMethod(), a.getReasonCode(), a.getError(),
					a.getRequestPayload(), a.getResponsePayload(), a.getExpiresAt(), a.getLastCheckedAt(),
					a.getCreatedAt());
		}
	}

	public record WebhookView(Long id, String billpayEventId, String billpayPaymentId, String merchantReference,
			String eventType, String reportedStatus, Boolean signatureValid, String signatureScheme, String status,
			String error, String headers, String payload, Instant receivedAt, Instant processedAt) {

		static WebhookView from(WebhookEvent e) {
			return new WebhookView(e.getId(), e.getBillpayEventId(), e.getBillpayPaymentId(), e.getMerchantReference(),
					e.getEventType(), e.getReportedStatus(), e.getSignatureValid(), e.getSignatureScheme(),
					e.getStatus().name(), e.getError(), e.getHeaders(), e.getPayload(), e.getReceivedAt(),
					e.getProcessedAt());
		}
	}

	public record RefundView(UUID id, String orderNumber, String merchantReference, String billpayRefundId,
			BigDecimal amount, String currency, String reason, String status, String reasonCode, boolean external,
			String error, String requestPayload, String responsePayload, Instant createdAt, Instant updatedAt,
			/** BillPay's own word for the refund in its last answer, e.g. UNDER_REVIEW (ours is PENDING) */
			String billpayStatus) {

		private static final java.util.regex.Pattern BILLPAY_STATUS = java.util.regex.Pattern.compile("\"status\"\\s*:\\s*\"([A-Za-z_]+)\"");

		static RefundView from(Refund r, String orderNumber) {
			return new RefundView(r.getId(), orderNumber, r.getMerchantReference(), r.getBillpayRefundId(),
					r.getAmount(), r.getCurrency(), r.getReason(), r.getStatus().name(), r.getReasonCode(),
					r.isExternal(), r.getError(), r.getRequestPayload(), r.getResponsePayload(), r.getCreatedAt(),
					r.getUpdatedAt(), billpayStatus(r.getResponsePayload()));
		}

		private static String billpayStatus(String body) {
			if (body == null) {
				return null;
			}
			java.util.regex.Matcher m = BILLPAY_STATUS.matcher(body);
			return m.find() ? m.group(1).toUpperCase(java.util.Locale.ROOT) : null;
		}
	}

	public record ItemRow(Long productId, String productName, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {

		static ItemRow from(OrderItem i) {
			return new ItemRow(i.getProductId(), i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal());
		}
	}

	public record OrderDetail(OrderRow order, String customerEmail, DeliveryDetail delivery, List<ItemRow> items,
			List<OrderEvent> timeline, List<AttemptView> attempts, List<RefundView> refunds, List<WebhookView> webhooks,
			List<NotificationAdminController.NotificationRow> emails, List<ParcelRow> parcels) {
	}

	/** One seller's parcel of the order (shopId null = Sodo Gebeya's own); staff can move any parcel. */
	public record ParcelRow(String number, int parcelNo, Long shopId, String seller, BigDecimal itemsTotal,
			BigDecimal discountShare, BigDecimal deliveryFee, String fulfilmentStatus, List<String> nextSteps,
			String trackingNote, Instant shippedAt, Instant deliveredAt, Instant cancelledAt, List<String> items,
			/** Rider on this parcel (M21), null = none yet */
			Long riderId, String riderName,
			/** Cash orders: what the buyer pays at the door for this parcel (null = paid online) */
			BigDecimal cashToCollect, Instant cashCollectedAt) {
	}

	public record RefundRequest(@NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal amount,
			@Size(max = 500) String reason, UUID paymentAttemptId) {
	}

	/** What the integration is configured with, without revealing secrets. */
	@GetMapping("/config")
	public Map<String, Object> config() {
		BillPayMode.Status mode = billPayMode.status();
		BillPayMode.EnvironmentStatus active = mode.environments().get(mode.mode());
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("mode", mode);
		// the environment new orders use, in the shape the setup page already shows
		result.put("billpayBaseUrl", active.baseUrl());
		result.put("sandbox", mode.mode() == BillPayEnvironment.SANDBOX);
		result.put("apiKeyConfigured", active.apiKeyConfigured());
		result.put("apiKeyHint", active.apiKeyHint());
		result.put("webhookVerification", billPay.webhook().verification().name());
		result.put("webhookSecretConfigured", active.webhookSecretConfigured());
		result.put("webhookSignatureHeader", billPay.webhook().signatureHeader());
		result.put("webhookPath", "/api/webhooks/billpay");
		result.put("publicBaseUrl", app.publicBaseUrl());
		result.put("reconcileAfter", app.reconcileAfter().toString());
		result.put("paymentExpiry", app.paymentExpiry().toString());
		return result;
	}

	public record ModeRequest(@NotNull BillPayEnvironment mode, String confirm) {
	}

	/**
	 * Switches which BillPay new orders use. Going live means real money, so the admin has to type LIVE to confirm;
	 * it is refused (409 MODE_NOT_READY, with the reasons) while live isn't safe. Orders already placed are unaffected.
	 */
	@PostMapping("/billpay/mode")
	public BillPayMode.Status switchMode(@Valid @RequestBody ModeRequest req) {
		if (req.mode() == BillPayEnvironment.LIVE && !"LIVE".equals(req.confirm())) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "CONFIRMATION_REQUIRED",
					"Type LIVE to confirm that real payments will be taken.");
		}
		billPayMode.switchTo(req.mode(), CurrentUser.require().email());
		return billPayMode.status();
	}

	/** Figures for one environment: by default the one new orders use, so test orders never mix with real ones. */
	@GetMapping("/dashboard")
	@Transactional(readOnly = true)
	public Map<String, Object> dashboard(@RequestParam(required = false) BillPayEnvironment env) {
		BillPayEnvironment e = env != null ? env : billPayMode.current();
		Map<String, Long> byStatus = new LinkedHashMap<>();
		for (OrderStatus s : OrderStatus.values()) {
			byStatus.put(s.name(), orders.countByStatusAndEnvironment(s, e));
		}
		long succeeded = attempts.countByStatusAndEnvironment(PaymentStatus.SUCCEEDED, e);
		long finished = succeeded + attempts.countByStatusAndEnvironment(PaymentStatus.FAILED, e)
				+ attempts.countByStatusAndEnvironment(PaymentStatus.EXPIRED, e)
				+ attempts.countByStatusAndEnvironment(PaymentStatus.CANCELLED, e);
		Map<String, Long> failures = new LinkedHashMap<>();
		for (Object[] row : attempts.countFailuresByReason(e)) {
			failures.put(row[0] == null ? "UNKNOWN" : (String) row[0], (Long) row[1]);
		}
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("sandbox", billPayMode.isSandbox());
		result.put("environment", e);
		result.put("paidVolume", orders.sumTotalByStatusIn(
				EnumSet.of(OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED), e));
		result.put("ordersByStatus", byStatus);
		result.put("paymentSuccessRate", finished == 0 ? null : (double) succeeded / finished);
		result.put("failuresByReason", failures);
		result.put("pendingPayments", attempts.countByStatusAndEnvironment(PaymentStatus.PENDING, e));
		result.put("webhooksAwaitingProcessing", webhooks.findByStatus(WebhookEvent.Status.RECEIVED, PageRequest.of(0, 1))
				.getTotalElements());
		return result;
	}

	@GetMapping("/orders")
	@Transactional(readOnly = true)
	public PageDto<OrderRow> orders(@RequestParam(required = false) OrderStatus status,
			@RequestParam(required = false) et.tenapay.shop.order.FulfilmentStatus fulfilment,
			@RequestParam(required = false) BillPayEnvironment env,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String query = q == null || q.isBlank() ? null : q.trim();
		return PageDto.of(orders.adminSearch(status, fulfilment, env, query,
				PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending())).map(OrderRow::from));
	}

	@GetMapping("/orders/{orderNumber}")
	@Transactional(readOnly = true)
	public OrderDetail order(@PathVariable String orderNumber) {
		Order o = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		List<PaymentAttempt> list = attempts.findByOrderIdOrderByAttemptNoAsc(o.getId());
		List<WebhookView> hooks = list.stream()
				.flatMap(a -> webhooks.findForPayment(a.getBillpayPaymentId(), a.getMerchantReference()).stream())
				.distinct()
				.sorted((a, b) -> a.getReceivedAt().compareTo(b.getReceivedAt()))
				.map(WebhookView::from)
				.toList();
		Map<Long, String> shopNames = new java.util.HashMap<>();
		List<et.tenapay.shop.order.OrderParcel> parcelList = parcelRepo.findByOrderIdOrderByParcelNoAsc(o.getId());
		shopRepo.findAllById(parcelList.stream().map(et.tenapay.shop.order.OrderParcel::getShopId)
				.filter(java.util.Objects::nonNull).toList()).forEach(sh -> shopNames.put(sh.getId(), sh.getName()));
		List<ParcelRow> parcelRows = parcelList.stream().map(p -> new ParcelRow(p.number(o.getOrderNumber()), p.getParcelNo(),
				p.getShopId(), p.getShopId() == null ? "Sodo Gebeya" : shopNames.get(p.getShopId()), p.getItemsTotal(),
				p.getDiscountShare(), p.getDeliveryFee(), p.getFulfilmentStatus() == null ? null : p.getFulfilmentStatus().name(),
				p.getFulfilmentStatus() == null ? List.of() : p.getFulfilmentStatus().next().stream().map(Enum::name).sorted().toList(),
				p.getTrackingNote(), p.getShippedAt(), p.getDeliveredAt(), p.getCancelledAt(),
				o.getItems().stream().filter(i -> i.getParcelNo() != null && i.getParcelNo() == p.getParcelNo())
						.map(i -> i.getQuantity() + " × " + i.getProductName()).toList(),
				p.getRiderId(), p.getRiderId() == null ? null
						: riderRepo.findById(p.getRiderId()).map(r -> r.getName() + " (" + r.getPhone() + ")").orElse(null),
				o.cash() ? et.tenapay.shop.dispute.DisputeService.parcelPaid(p) : null, p.getCashCollectedAt()))
				.toList();
		return new OrderDetail(OrderRow.from(o), o.getCustomerEmail(), DeliveryDetail.from(o),
				o.getItems().stream().map(ItemRow::from).toList(),
				orderEvents.findByOrderIdOrderByCreatedAtAscIdAsc(o.getId()),
				list.stream().map(a -> AttemptView.from(a, o.getOrderNumber(), refunds.refundable(a))).toList(),
				refundRepo.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
						.map(r -> RefundView.from(r, o.getOrderNumber())).toList(),
				hooks,
				notificationRepo.findByOrderNumberOrderByCreatedAtAsc(o.getOrderNumber()).stream()
						.map(NotificationAdminController.NotificationRow::of).toList(), parcelRows);
	}

	@GetMapping("/payments")
	@Transactional(readOnly = true)
	public PageDto<AttemptView> payments(@RequestParam(required = false) PaymentStatus status,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
		Page<PaymentAttempt> result = status == null ? attempts.findAll(pr) : attempts.findByStatus(status, pr);
		Map<UUID, String> numbers = orderNumbers(result.map(PaymentAttempt::getOrderId).getContent());
		return PageDto.of(result.map(a -> AttemptView.from(a, numbers.get(a.getOrderId()), null)));
	}

	@PostMapping("/payments/{id}/reconcile")
	public Map<String, Object> reconcile(@PathVariable UUID id) {
		PaymentService.Outcome outcome = payments.reconcile(id);
		return Map.of("outcome", outcome.name(), "status", attempts.findById(id).orElseThrow().getStatus().name());
	}

	@GetMapping("/refunds")
	@Transactional(readOnly = true)
	public PageDto<RefundView> refunds(@RequestParam(required = false) RefundStatus status,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
		Page<Refund> result = status == null ? refundRepo.findAll(pr) : refundRepo.findByStatus(status, pr);
		Map<UUID, String> numbers = orderNumbers(result.map(Refund::getOrderId).getContent());
		return PageDto.of(result.map(r -> RefundView.from(r, numbers.get(r.getOrderId()))));
	}

	@PostMapping("/orders/{orderNumber}/refunds")
	public RefundView refund(@PathVariable String orderNumber, @Valid @RequestBody RefundRequest req) {
		Refund r = refunds.create(orderNumber, req.amount(), req.reason(), req.paymentAttemptId());
		return RefundView.from(r, orderNumber);
	}

	@PostMapping("/refunds/{id}/retry")
	public RefundView retryRefund(@PathVariable UUID id) {
		Refund r = refunds.retry(id);
		return RefundView.from(r, orders.findById(r.getOrderId()).map(Order::getOrderNumber).orElse(null));
	}

	@GetMapping("/webhooks")
	@Transactional(readOnly = true)
	public PageDto<WebhookView> webhooks(@RequestParam(required = false) WebhookEvent.Status status,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by("receivedAt").descending());
		return PageDto.of((status == null ? webhooks.findAll(pr) : webhooks.findByStatus(status, pr))
				.map(WebhookView::from));
	}

	/** Re-sends a stored webhook through Kafka; duplicates are detected by the processor (TC-31). */
	@PostMapping("/webhooks/{id}/replay")
	@Transactional
	public Map<String, Object> replay(@PathVariable Long id) {
		WebhookEvent e = webhooks.findById(id).orElseThrow(() -> ApiException.notFound("Webhook"));
		if (e.getStatus() == WebhookEvent.Status.REJECTED) {
			throw new ApiException(HttpStatus.CONFLICT, "REJECTED", "Rejected webhooks can't be replayed");
		}
		e.setStatus(WebhookEvent.Status.RECEIVED);
		AfterCommit.run(() -> webhookPublisher.publish(e));
		return Map.of("replayed", id);
	}

	private Map<UUID, String> orderNumbers(List<UUID> orderIds) {
		return orders.findAllById(orderIds.stream().distinct().toList()).stream()
				.collect(Collectors.toMap(Order::getId, Order::getOrderNumber, (a, b) -> a));
	}
}
