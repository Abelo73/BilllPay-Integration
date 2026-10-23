package et.tenapay.shop.refund;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderService;
import et.tenapay.shop.order.OrderStatus;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentService.Outcome;
import et.tenapay.shop.payment.PaymentStatus;
import et.tenapay.shop.payment.billpay.BillPayClient;
import et.tenapay.shop.payment.billpay.BillPayException;
import et.tenapay.shop.payment.billpay.BillPayRefund;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class RefundService {

	private static final EnumSet<OrderStatus> REFUNDABLE = EnumSet.of(OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED,
			OrderStatus.REVIEW_REQUIRED);

	private final RefundRepository refunds;
	private final OrderRepository orders;
	private final PaymentAttemptRepository attempts;
	private final OrderService orderService;
	private final BillPayClient billPay;
	private final TransactionTemplate tx;
	private final et.tenapay.shop.monitoring.ShopMetrics metrics;

	/** Body for POST /api/v1/checkout/payments/{id}/refunds; the payment id goes in the path. */
	record RefundRequest(String merchantReference, BigDecimal amount, String currency, String reason) {
	}

	/** Amount of a successful payment that is not yet refunded or being refunded. */
	public BigDecimal refundable(PaymentAttempt attempt) {
		if (attempt.getStatus() != PaymentStatus.SUCCEEDED) {
			return BigDecimal.ZERO;
		}
		BigDecimal held = refunds.findByPaymentAttemptIdOrderByCreatedAtAsc(attempt.getId()).stream()
				.filter(r -> r.getStatus().holdsAmount())
				.map(Refund::getAmount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		return attempt.getAmount().subtract(held).max(BigDecimal.ZERO);
	}

	/**
	 * Refunds part or all of a successful payment. Defaults to the order's latest successful attempt. Over-refunds are
	 * rejected here, without calling BillPay (TC-23).
	 */
	public Refund create(String orderNumber, BigDecimal amount, String reason, UUID attemptId) {
		Refund refund = tx.execute(s -> prepare(orderNumber, amount, reason, attemptId));
		return send(refund.getId());
	}

	/** Re-sends a refund whose BillPay call failed without an answer, with its original Idempotency-Key. */
	public Refund retry(UUID refundId) {
		Refund refund = refunds.findById(refundId).orElseThrow(() -> ApiException.notFound("Refund"));
		if (refund.getStatus() != RefundStatus.ERROR && refund.getStatus() != RefundStatus.REQUESTED) {
			throw new ApiException(HttpStatus.CONFLICT, "REFUND_NOT_RETRYABLE",
					"Only refunds that never reached BillPay can be retried");
		}
		return send(refundId);
	}

	private Refund prepare(String orderNumber, BigDecimal requested, String reason, UUID attemptId) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		order = orders.lockById(order.getId()).orElseThrow();
		if (!REFUNDABLE.contains(order.getStatus())) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_REFUNDABLE",
					"Order " + orderNumber + " is " + order.getStatus() + " and can't be refunded");
		}
		UUID orderId = order.getId();
		PaymentAttempt attempt = (attemptId != null ? attempts.findById(attemptId).filter(a -> a.getOrderId().equals(orderId))
				: attempts.findByOrderIdOrderByAttemptNoAsc(orderId).stream()
						.filter(a -> a.getStatus() == PaymentStatus.SUCCEEDED)
						.reduce((first, second) -> second))
				.orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "NO_SUCCESSFUL_PAYMENT",
						"This order has no successful payment to refund"));

		BigDecimal amount = requested.setScale(2, RoundingMode.HALF_UP);
		BigDecimal refundable = refundable(attempt);
		if (amount.signum() <= 0 || amount.compareTo(refundable) > 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REFUND_AMOUNT_INVALID",
					"Refund must be between 0.01 and " + refundable + " " + attempt.getCurrency(),
					Map.of("refundable", refundable));
		}

		Refund refund = new Refund();
		refund.setOrderId(orderId);
		refund.setPaymentAttemptId(attempt.getId());
		refund.setMerchantReference(orderNumber + "-R" + (refunds.countByOrderId(orderId) + 1));
		refund.setIdempotencyKey(UUID.randomUUID());
		refund.setAmount(amount);
		refund.setCurrency(attempt.getCurrency());
		refund.setReason(reason);
		refund.setStatus(RefundStatus.REQUESTED);
		refund.setRequestPayload(billPay.toJson(new RefundRequest(refund.getMerchantReference(), amount,
				attempt.getCurrency(), reason)));
		refunds.save(refund);
		orderService.note(order, "REFUND_REQUESTED", refund.getMerchantReference() + " " + amount + " " + refund.getCurrency()
				+ (reason != null ? " (" + reason + ")" : ""));
		return refund;
	}

	private Refund send(UUID refundId) {
		Refund refund = refunds.findById(refundId).orElseThrow();
		String billpayPaymentId = attempts.findById(refund.getPaymentAttemptId()).orElseThrow().getBillpayPaymentId();
		BillPayRefund response;
		try {
			response = billPay.createRefund(billpayPaymentId, refund.getRequestPayload(), refund.getIdempotencyKey());
		} catch (BillPayException e) {
			tx.executeWithoutResult(s -> recordFailure(refundId, e));
			return refunds.findById(refundId).orElseThrow();
		}
		RefundStatus status = Optional.ofNullable(RefundStatus.fromBillPay(response.status())).orElse(RefundStatus.PENDING);
		apply(refundId, status, response, "refund-response");
		return refunds.findById(refundId).orElseThrow();
	}

	private void recordFailure(UUID refundId, BillPayException e) {
		Refund refund = refunds.lockById(refundId).orElseThrow();
		refund.setError(e.getMessage());
		refund.setResponsePayload(e.getResponseBody());
		boolean definite = e.getHttpStatus() >= 400 && e.getHttpStatus() < 500;
		Order order = orders.findById(refund.getOrderId()).orElseThrow();
		metrics.refundStatus(definite ? RefundStatus.REFUSED.name() : RefundStatus.ERROR.name());
		if (definite) {
			refund.setStatus(RefundStatus.REFUSED);
			refund.setReasonCode(reasonCodeFrom(e.getResponseBody(), "REJECTED_HTTP_" + e.getHttpStatus()));
			orderService.note(order, "REFUND_REFUSED", refund.getMerchantReference() + " " + refund.getReasonCode());
		} else {
			refund.setStatus(RefundStatus.ERROR);
			orderService.note(order, "REFUND_REQUEST_FAILED", refund.getMerchantReference() + " " + e.getMessage());
		}
	}

	private String reasonCodeFrom(String body, String fallback) {
		if (body == null) {
			return fallback;
		}
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"reasonCode\"\\s*:\\s*\"([A-Z_]+)\"").matcher(body);
		if (m.find()) {
			return m.group(1);
		}
		return body.contains("REFUND_REFUSED") ? "REFUND_REFUSED" : fallback;
	}

	/** Applies a refund status from BillPay (response or webhook). */
	public Outcome apply(UUID refundId, RefundStatus next, BillPayRefund reported, String source) {
		return tx.execute(s -> {
			Refund refund = refunds.lockById(refundId).orElseThrow();
			RefundStatus current = refund.getStatus();
			if (reported.refundId() != null && refund.getBillpayRefundId() == null) {
				refund.setBillpayRefundId(reported.refundId());
			}
			if (reported.raw() != null && "refund-response".equals(source)) {
				refund.setResponsePayload(reported.raw());
			}
			if (next == current) {
				return Outcome.DUPLICATE;
			}
			if (current.isFinal()) {
				log.info("Ignoring {} for refund {} already {} ({})", next, refund.getMerchantReference(), current, source);
				return Outcome.IGNORED;
			}
			refund.setStatus(next);
			refund.setError(null);
			metrics.refundStatus(next.name());
			if (reported.reasonCode() != null) {
				refund.setReasonCode(reported.reasonCode());
			}
			Order order = orders.lockById(refund.getOrderId()).orElseThrow();
			String detail = refund.getMerchantReference() + " " + refund.getAmount() + " " + current + "->" + next
					+ " via " + source + (refund.getReasonCode() != null ? " reason=" + refund.getReasonCode() : "");
			if (next == RefundStatus.SUCCEEDED) {
				updateOrderAfterRefund(order, detail);
			} else {
				orderService.note(order, "REFUND_" + next, detail);
			}
			return Outcome.APPLIED;
		});
	}

	private void updateOrderAfterRefund(Order order, String detail) {
		List<PaymentAttempt> paid = attempts.findByOrderIdOrderByAttemptNoAsc(order.getId()).stream()
				.filter(a -> a.getStatus() == PaymentStatus.SUCCEEDED).toList();
		BigDecimal totalPaid = paid.stream().map(PaymentAttempt::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal totalRefunded = refunds.findByOrderIdOrderByCreatedAtAsc(order.getId()).stream()
				.filter(r -> r.getStatus() == RefundStatus.SUCCEEDED)
				.map(Refund::getAmount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal kept = totalPaid.subtract(totalRefunded);

		if (kept.signum() <= 0) {
			orderService.transition(order, OrderStatus.REFUNDED, "REFUNDED", detail);
		} else if (order.getStatus() == OrderStatus.REVIEW_REQUIRED && kept.compareTo(order.getTotal()) == 0) {
			// e.g. a duplicate payment was refunded and exactly one order total remains
			orderService.transition(order, OrderStatus.PAID, "REVIEW_RESOLVED", detail);
		} else if (order.getStatus() == OrderStatus.PAID || order.getStatus() == OrderStatus.PARTIALLY_REFUNDED) {
			orderService.transition(order, OrderStatus.PARTIALLY_REFUNDED, "PARTIALLY_REFUNDED", detail);
		} else {
			orderService.note(order, "REFUND_SUCCEEDED", detail);
		}
	}

	/**
	 * Matches a refund webhook to our refund: by BillPay refund id, our reference, or the newest open refund on the
	 * payment. A successful refund we don't know about (e.g. issued from the BillPay dashboard) is recorded as
	 * external.
	 */
	public Outcome applyWebhook(BillPayRefund reported, String source) {
		RefundStatus next = RefundStatus.fromBillPay(reported.status());
		if (next == null) {
			next = RefundStatus.SUCCEEDED; // a "refunded" event without a status field
		}
		Optional<Refund> match = Optional.ofNullable(reported.refundId()).flatMap(refunds::findByBillpayRefundId)
				.or(() -> Optional.ofNullable(reported.merchantReference()).flatMap(refunds::findByMerchantReference));
		Optional<PaymentAttempt> attempt = Optional.ofNullable(reported.paymentId()).flatMap(attempts::findByBillpayPaymentId);
		if (match.isEmpty() && attempt.isPresent()) {
			match = refunds.findFirstByPaymentAttemptIdAndStatusInOrderByCreatedAtDesc(attempt.get().getId(),
					EnumSet.of(RefundStatus.REQUESTED, RefundStatus.PENDING, RefundStatus.ERROR));
		}
		if (match.isPresent()) {
			return apply(match.get().getId(), next, reported, source);
		}
		if (attempt.isEmpty() || next != RefundStatus.SUCCEEDED || reported.amount() == null) {
			log.warn("Refund webhook {} matches no refund (refundId={}, paymentId={})", source, reported.refundId(),
					reported.paymentId());
			return Outcome.IGNORED;
		}
		PaymentAttempt a = attempt.get();
		boolean alreadyRecorded = refunds.findByPaymentAttemptIdOrderByCreatedAtAsc(a.getId()).stream()
				.anyMatch(r -> r.getStatus() == RefundStatus.SUCCEEDED && r.getAmount().compareTo(reported.amount()) == 0
						&& (reported.refundId() == null || reported.refundId().equals(r.getBillpayRefundId())));
		if (alreadyRecorded) {
			return Outcome.DUPLICATE;
		}
		UUID externalId = tx.execute(s -> {
			Refund r = new Refund();
			r.setOrderId(a.getOrderId());
			r.setPaymentAttemptId(a.getId());
			r.setMerchantReference(orders.findById(a.getOrderId()).orElseThrow().getOrderNumber() + "-R"
					+ (refunds.countByOrderId(a.getOrderId()) + 1) + "-EXT");
			r.setIdempotencyKey(UUID.randomUUID());
			r.setBillpayRefundId(reported.refundId());
			r.setAmount(reported.amount());
			r.setCurrency(a.getCurrency());
			r.setReason("Issued outside TenaShop");
			r.setStatus(RefundStatus.PENDING);
			r.setExternal(true);
			r.setResponsePayload(reported.raw());
			return refunds.save(r).getId();
		});
		return apply(externalId, RefundStatus.SUCCEEDED, reported, source);
	}
}
