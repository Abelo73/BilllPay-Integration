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
import et.tenapay.shop.payment.billpay.BillPayProperties;
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
	private final AppProperties app;

	public record OrderRow(UUID id, String orderNumber, String status, BigDecimal total, String currency,
			String customerName, String customerPhone, Instant createdAt, Instant paidAt) {

		static OrderRow from(Order o) {
			return new OrderRow(o.getId(), o.getOrderNumber(), o.getStatus().name(), o.getTotal(), o.getCurrency(),
					o.getCustomerName(), o.getCustomerPhone(), o.getCreatedAt(), o.getPaidAt());
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
			String error, String requestPayload, String responsePayload, Instant createdAt, Instant updatedAt) {

		static RefundView from(Refund r, String orderNumber) {
			return new RefundView(r.getId(), orderNumber, r.getMerchantReference(), r.getBillpayRefundId(),
					r.getAmount(), r.getCurrency(), r.getReason(), r.getStatus().name(), r.getReasonCode(),
					r.isExternal(), r.getError(), r.getRequestPayload(), r.getResponsePayload(), r.getCreatedAt(),
					r.getUpdatedAt());
		}
	}

	public record ItemRow(Long productId, String productName, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {

		static ItemRow from(OrderItem i) {
			return new ItemRow(i.getProductId(), i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal());
		}
	}

	public record OrderDetail(OrderRow order, String customerEmail, List<ItemRow> items, List<OrderEvent> timeline,
			List<AttemptView> attempts, List<RefundView> refunds, List<WebhookView> webhooks) {
	}

	public record RefundRequest(@NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal amount,
			@Size(max = 500) String reason, UUID paymentAttemptId) {
	}

	/** What the integration is configured with, without revealing secrets. */
	@GetMapping("/config")
	public Map<String, Object> config() {
		String key = billPay.apiKey();
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("billpayBaseUrl", billPay.baseUrl());
		result.put("sandbox", billPay.isSandbox());
		result.put("apiKeyConfigured", key != null && !key.isBlank());
		result.put("apiKeyHint", key == null || key.length() < 16 ? null
				: key.substring(0, 9) + "…" + key.substring(key.length() - 4));
		result.put("webhookVerification", billPay.webhook().verification().name());
		result.put("webhookSecretConfigured", billPay.webhook().secret() != null && !billPay.webhook().secret().isBlank());
		result.put("webhookSignatureHeader", billPay.webhook().signatureHeader());
		result.put("webhookPath", "/api/webhooks/billpay");
		result.put("publicBaseUrl", app.publicBaseUrl());
		result.put("reconcileAfter", app.reconcileAfter().toString());
		result.put("paymentExpiry", app.paymentExpiry().toString());
		return result;
	}

	@GetMapping("/dashboard")
	@Transactional(readOnly = true)
	public Map<String, Object> dashboard() {
		Map<String, Long> byStatus = new LinkedHashMap<>();
		for (OrderStatus s : OrderStatus.values()) {
			byStatus.put(s.name(), orders.countByStatus(s));
		}
		long succeeded = attempts.countByStatus(PaymentStatus.SUCCEEDED);
		long finished = succeeded + attempts.countByStatus(PaymentStatus.FAILED)
				+ attempts.countByStatus(PaymentStatus.EXPIRED) + attempts.countByStatus(PaymentStatus.CANCELLED);
		Map<String, Long> failures = new LinkedHashMap<>();
		for (Object[] row : attempts.countFailuresByReason()) {
			failures.put(row[0] == null ? "UNKNOWN" : (String) row[0], (Long) row[1]);
		}
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("sandbox", billPay.isSandbox());
		result.put("paidVolume", orders.sumTotalByStatusIn(
				EnumSet.of(OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED)));
		result.put("ordersByStatus", byStatus);
		result.put("paymentSuccessRate", finished == 0 ? null : (double) succeeded / finished);
		result.put("failuresByReason", failures);
		result.put("pendingPayments", attempts.countByStatus(PaymentStatus.PENDING));
		result.put("webhooksAwaitingProcessing", webhooks.findByStatus(WebhookEvent.Status.RECEIVED, PageRequest.of(0, 1))
				.getTotalElements());
		return result;
	}

	@GetMapping("/orders")
	@Transactional(readOnly = true)
	public PageDto<OrderRow> orders(@RequestParam(required = false) OrderStatus status,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String query = q == null || q.isBlank() ? null : q.trim();
		return PageDto.of(orders.adminSearch(status, query,
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
		return new OrderDetail(OrderRow.from(o), o.getCustomerEmail(), o.getItems().stream().map(ItemRow::from).toList(),
				orderEvents.findByOrderIdOrderByCreatedAtAscIdAsc(o.getId()),
				list.stream().map(a -> AttemptView.from(a, o.getOrderNumber(), refunds.refundable(a))).toList(),
				refundRepo.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
						.map(r -> RefundView.from(r, o.getOrderNumber())).toList(),
				hooks);
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
