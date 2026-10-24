package et.tenapay.shop.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderService;
import et.tenapay.shop.order.OrderStatus;
import et.tenapay.shop.payment.billpay.BillPayClient;
import et.tenapay.shop.payment.billpay.BillPayClient.CreatePaymentRequest;
import et.tenapay.shop.payment.billpay.BillPayClient.Customer;
import et.tenapay.shop.payment.billpay.BillPayException;
import et.tenapay.shop.payment.billpay.BillPayPayment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

	public enum Outcome { APPLIED, DUPLICATE, IGNORED }

	private final PaymentAttemptRepository attempts;
	private final OrderRepository orders;
	private final OrderService orderService;
	private final BillPayClient billPay;
	private final AppProperties app;
	private final TransactionTemplate tx;
	private final ShopMetrics metrics;

	/**
	 * Returns a BillPay checkout URL for the order. Reuses a live attempt, retries a CREATED/ERROR attempt with
	 * its original Idempotency-Key, or starts a new attempt after a final one.
	 */
	public String startPayment(UUID orderId) {
		PaymentAttempt attempt = tx.execute(s -> prepareAttempt(orderId));
		if (attempt.getStatus() == PaymentStatus.PENDING) {
			return attempt.getCheckoutUrl();
		}

		BillPayPayment response;
		try {
			response = billPay.createPayment(attempt.getRequestPayload(), attempt.getIdempotencyKey());
		} catch (BillPayException e) {
			metrics.paymentRequested(e.getHttpStatus() >= 400 && e.getHttpStatus() < 500 ? "rejected" : "error");
			tx.executeWithoutResult(s -> recordCreateFailure(attempt.getId(), e));
			throw e;
		}
		if (response.checkoutUrl() == null) {
			metrics.paymentRequested("error");
			tx.executeWithoutResult(s -> recordCreateFailure(attempt.getId(),
					new BillPayException(502, response.raw(), "No checkout URL in BillPay response", null)));
			throw new ApiException(HttpStatus.BAD_GATEWAY, "PAYMENT_PROVIDER_ERROR",
					"The payment provider returned an unexpected response.");
		}
		metrics.paymentRequested("created");
		tx.executeWithoutResult(s -> recordCreated(attempt.getId(), response));
		return response.checkoutUrl();
	}

	private PaymentAttempt prepareAttempt(UUID orderId) {
		Order order = orders.lockById(orderId).orElseThrow(() -> ApiException.notFound("Order"));
		if (!order.getStatus().awaitingPayment()) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAYABLE",
					"This order can no longer be paid (status " + order.getStatus() + ").");
		}
		PaymentAttempt latest = attempts.findFirstByOrderIdOrderByAttemptNoDesc(orderId).orElse(null);
		if (latest != null) {
			boolean live = latest.getStatus() == PaymentStatus.PENDING && latest.getCheckoutUrl() != null
					&& (latest.getExpiresAt() == null || latest.getExpiresAt().isAfter(Instant.now()));
			if (live || latest.getStatus() == PaymentStatus.CREATED || latest.getStatus() == PaymentStatus.ERROR) {
				return latest;
			}
		}
		int no = latest == null ? 1 : latest.getAttemptNo() + 1;
		PaymentAttempt attempt = new PaymentAttempt();
		attempt.setOrderId(orderId);
		attempt.setAttemptNo(no);
		attempt.setMerchantReference(order.getOrderNumber() + "-A" + no);
		attempt.setIdempotencyKey(UUID.randomUUID());
		attempt.setStatus(PaymentStatus.CREATED);
		attempt.setAmount(order.getTotal());
		attempt.setCurrency(order.getCurrency());
		attempt.setRequestPayload(billPay.toJson(buildRequest(order, attempt.getMerchantReference())));
		attempts.save(attempt);

		if (order.getStatus() == OrderStatus.PAYMENT_FAILED) {
			orderService.transition(order, OrderStatus.PENDING_PAYMENT, "PAYMENT_RETRY", "attempt " + no);
		}
		return attempt;
	}

	private CreatePaymentRequest buildRequest(Order order, String merchantReference) {
		String redirectBase = app.redirectBaseUrl();
		String returnUrl;
		String cancelUrl;
		if (redirectBase != null && !redirectBase.isBlank()) {
			// BillPay sends the shopper to our https backend, which forwards to the shop (BillPayRedirectController)
			String base = redirectBase.replaceAll("/+$", "");
			returnUrl = base + "/api/billpay/return?order=" + order.getOrderNumber();
			cancelUrl = base + "/api/billpay/cancel?order=" + order.getOrderNumber();
		} else {
			returnUrl = app.publicBaseUrl() + "/checkout/return?order=" + order.getOrderNumber();
			cancelUrl = app.publicBaseUrl() + "/checkout/cancelled?order=" + order.getOrderNumber();
		}
		return new CreatePaymentRequest(merchantReference, order.getTotal(), order.getCurrency(),
				"TenaShop order " + order.getOrderNumber(),
				new Customer(order.getCustomerName(), order.getCustomerPhone(), order.getCustomerEmail()),
				returnUrl, cancelUrl);
	}

	private void recordCreated(UUID attemptId, BillPayPayment response) {
		PaymentAttempt attempt = attempts.lockById(attemptId).orElseThrow();
		attempt.setBillpayPaymentId(response.paymentId());
		attempt.setCheckoutUrl(response.checkoutUrl());
		attempt.setResponsePayload(response.raw());
		attempt.setError(null);
		attempt.setExpiresAt(response.expiresAt() != null ? response.expiresAt()
				: attempt.getCreatedAt().plus(app.paymentExpiry()));
		if (attempt.getStatus() == PaymentStatus.CREATED || attempt.getStatus() == PaymentStatus.ERROR) {
			attempt.setStatus(PaymentStatus.PENDING);
			Order order = orders.findById(attempt.getOrderId()).orElseThrow();
			orderService.note(order, "PAYMENT_REQUESTED",
					attempt.getMerchantReference() + " billpayId=" + response.paymentId());
		}
	}

	private void recordCreateFailure(UUID attemptId, BillPayException e) {
		PaymentAttempt attempt = attempts.lockById(attemptId).orElseThrow();
		if (attempt.getStatus() != PaymentStatus.CREATED && attempt.getStatus() != PaymentStatus.ERROR) {
			return;
		}
		attempt.setError(e.getMessage());
		attempt.setResponsePayload(e.getResponseBody());
		// Network errors and 5xx may have reached BillPay: keep the key and retry. 4xx is a definite rejection.
		boolean definite = e.getHttpStatus() >= 400 && e.getHttpStatus() < 500;
		attempt.setStatus(definite ? PaymentStatus.FAILED : PaymentStatus.ERROR);
		if (definite) {
			attempt.setReasonCode("REJECTED_HTTP_" + e.getHttpStatus());
		}
		Order order = orders.findById(attempt.getOrderId()).orElseThrow();
		orderService.note(order, "PAYMENT_REQUEST_FAILED", e.getMessage());
	}

	/** Applies a status reported by BillPay (webhook or status query) to an attempt and its order. */
	public Outcome applyBillPayStatus(UUID attemptId, BillPayPayment reported, String source) {
		return tx.execute(s -> doApply(attemptId, reported, source));
	}

	private Outcome doApply(UUID attemptId, BillPayPayment reported, String source) {
		PaymentAttempt attempt = attempts.lockById(attemptId).orElseThrow();
		PaymentStatus current = attempt.getStatus();
		PaymentStatus next = PaymentStatus.fromBillPay(reported.status());
		if (next == null) {
			log.warn("Unknown BillPay status '{}' for {} ({})", reported.status(), attempt.getMerchantReference(), source);
			return Outcome.IGNORED;
		}
		if (next == current) {
			// BillPay keeps a payment open after a failed try (e.g. INSUFFICIENT_FUNDS) so the customer can retry;
			// record the latest failure so the shop can explain it.
			String reason = reported.reasonCode();
			if (!current.isFinal() && reason != null && !reason.equals(attempt.getReasonCode())) {
				attempt.setReasonCode(reason);
				Order order = orders.findById(attempt.getOrderId()).orElseThrow();
				orderService.note(order, "PAYMENT_TRY_FAILED",
						attempt.getMerchantReference() + " try failed: " + reason + " via " + source);
				metrics.paymentTryFailed(reason);
				return Outcome.APPLIED;
			}
			return Outcome.DUPLICATE;
		}
		// SUCCEEDED is terminal. Other final states only give way to SUCCEEDED, because money really moved.
		if (current == PaymentStatus.SUCCEEDED || (current.isFinal() && next != PaymentStatus.SUCCEEDED)) {
			log.info("Ignoring out-of-order {} for {} already {} ({})", next, attempt.getMerchantReference(), current, source);
			return Outcome.IGNORED;
		}

		attempt.setStatus(next);
		if (attempt.getBillpayPaymentId() == null) {
			attempt.setBillpayPaymentId(reported.paymentId());
		}
		if (reported.paymentMethod() != null) {
			attempt.setPaymentMethod(reported.paymentMethod());
		}
		if (reported.reasonCode() != null) {
			attempt.setReasonCode(reported.reasonCode());
		}
		metrics.paymentStatus(next.name(), attempt.getPaymentMethod(),
				next == PaymentStatus.SUCCEEDED ? null : attempt.getReasonCode());

		Order order = orders.lockById(attempt.getOrderId()).orElseThrow();
		String detail = attempt.getMerchantReference() + " " + current + "->" + next + " via " + source
				+ (attempt.getReasonCode() != null ? " reason=" + attempt.getReasonCode() : "");
		switch (next) {
			case SUCCEEDED -> onSucceeded(order, attempt, reported, detail);
			case FAILED, CANCELLED -> {
				if (order.getStatus() == OrderStatus.PENDING_PAYMENT) {
					orderService.transition(order, OrderStatus.PAYMENT_FAILED, "PAYMENT_FAILED", detail);
				} else {
					orderService.note(order, "PAYMENT_" + next, detail);
				}
			}
			case EXPIRED -> {
				if (order.getStatus().awaitingPayment()) {
					orderService.releaseReservations(order);
					orderService.transition(order, OrderStatus.EXPIRED, "EXPIRED", detail);
				} else {
					orderService.note(order, "PAYMENT_EXPIRED", detail);
				}
			}
			default -> orderService.note(order, "PAYMENT_" + next, detail);
		}
		return Outcome.APPLIED;
	}

	private void onSucceeded(Order order, PaymentAttempt attempt, BillPayPayment reported, String detail) {
		BigDecimal paid = reported.amount();
		boolean amountMismatch = paid != null && paid.compareTo(attempt.getAmount()) != 0;
		boolean currencyMismatch = reported.currency() != null
				&& !reported.currency().equalsIgnoreCase(attempt.getCurrency());
		if (amountMismatch || currencyMismatch) {
			orderService.transition(order, OrderStatus.REVIEW_REQUIRED, "AMOUNT_MISMATCH",
					detail + " expected " + attempt.getAmount() + " " + attempt.getCurrency() + " got " + paid + " "
							+ reported.currency());
			return;
		}
		if (order.getStatus().awaitingPayment()) {
			orderService.commitStock(order);
			order.setPaidAt(Instant.now());
			order.setFulfilmentStatus(et.tenapay.shop.order.FulfilmentStatus.UNFULFILLED);
			orderService.transition(order, OrderStatus.PAID, "PAID", detail);
		} else {
			// Late payment after expiry, or a second successful attempt: a person must decide (refund or fulfil).
			String reason = order.getStatus() == OrderStatus.PAID ? "DUPLICATE_PAYMENT" : "LATE_PAYMENT";
			orderService.transition(order, OrderStatus.REVIEW_REQUIRED, reason, detail);
		}
	}

	/** Asks BillPay for the attempt's current status and applies it. Never throws. */
	public Outcome reconcile(UUID attemptId) {
		PaymentAttempt attempt = attempts.findById(attemptId).orElseThrow();
		if (attempt.getBillpayPaymentId() == null) {
			return Outcome.IGNORED;
		}
		try {
			BillPayPayment status = billPay.getPayment(attempt.getBillpayPaymentId());
			return applyBillPayStatus(attemptId, status, "status-query");
		} catch (BillPayException e) {
			log.warn("Status query failed for {}: {}", attempt.getMerchantReference(), e.getMessage());
			return Outcome.IGNORED;
		} finally {
			tx.executeWithoutResult(s -> attempts.findById(attemptId).ifPresent(a -> a.setLastCheckedAt(Instant.now())));
		}
	}

	/** Expires an unpaid order whose payment window has passed, releasing its stock. */
	public void expireOrder(UUID orderId) {
		tx.executeWithoutResult(s -> {
			Order order = orders.lockById(orderId).orElseThrow();
			if (!order.getStatus().awaitingPayment()) {
				return;
			}
			for (PaymentAttempt a : attempts.findByOrderIdOrderByAttemptNoAsc(orderId)) {
				if (!a.getStatus().isFinal()) {
					a.setStatus(PaymentStatus.EXPIRED);
					metrics.paymentStatus(PaymentStatus.EXPIRED.name(), a.getPaymentMethod(), a.getReasonCode());
				}
			}
			orderService.releaseReservations(order);
			orderService.transition(order, OrderStatus.EXPIRED, "EXPIRED", "payment window of " + app.paymentExpiry() + " passed");
		});
	}
}
