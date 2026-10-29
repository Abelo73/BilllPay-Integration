package et.tenapay.shop.refund;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
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

/**
 * Refunds through BillPay. A refund is money we owe the buyer and stays open until the money is back: each call to
 * BillPay is one {@link RefundAttempt}. Temporary failures are retried on their own ({@link RefundRetryJob}); the rest
 * wait for staff, who can try again, record a payment made another way, or cancel the refund.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundService {

	private static final EnumSet<OrderStatus> REFUNDABLE = EnumSet.of(OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED,
			OrderStatus.REVIEW_REQUIRED);

	/** Statuses staff may send again. */
	private static final EnumSet<RefundStatus> RESENDABLE = EnumSet.of(RefundStatus.REQUESTED, RefundStatus.ERROR,
			RefundStatus.RETRY_LATER, RefundStatus.NEEDS_STAFF);

	/** Statuses staff may close by hand: BillPay has said no, so it won't also send the money. */
	private static final EnumSet<RefundStatus> CLOSABLE = EnumSet.of(RefundStatus.RETRY_LATER, RefundStatus.NEEDS_STAFF);

	/** In review at BillPay longer than this: staff are told (once). */
	static final Duration STUCK_AFTER = Duration.ofHours(24);

	private final RefundRepository refunds;
	private final RefundAttemptRepository attemptLog;
	private final OrderRepository orders;
	private final PaymentAttemptRepository attempts;
	private final OrderService orderService;
	private final BillPayClient billPay;
	private final TransactionTemplate tx;
	private final et.tenapay.shop.monitoring.ShopMetrics metrics;
	private final InboxService inbox;

	/**
	 * Body for POST /api/v1/checkout/payments/{id}/refunds; the payment id goes in the path. BillPay reads only these
	 * two fields: anything else (merchantReference, currency) makes it answer 400 "Malformed or unreadable request
	 * body" (found 2026-10-27 against the sandbox). Our own reference stays on our side; BillPay's refund id links them.
	 */
	record RefundRequest(BigDecimal amount, String reason) {
	}

	static final String DEFAULT_REASON = "Refund";

	/** Amount of a successful payment that is not yet refunded or owed. */
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
	 * rejected here, without calling BillPay (TC-23). Once this returns, the refund is owed: a refusal or no answer
	 * doesn't end it.
	 */
	public Refund create(String orderNumber, BigDecimal amount, String reason, UUID attemptId) {
		Refund refund = tx.execute(s -> prepare(orderNumber, amount, reason, attemptId));
		return send(refund.getId());
	}

	/** Staff: send again now. After a refusal it goes with a new Idempotency-Key; after no answer, with the same one. */
	public Refund retry(UUID refundId) {
		tx.executeWithoutResult(s -> {
			Refund r = refunds.lockById(refundId).orElseThrow(() -> ApiException.notFound("Refund"));
			if (!RESENDABLE.contains(r.getStatus())) {
				throw new ApiException(HttpStatus.CONFLICT, "REFUND_NOT_RETRYABLE",
						"This refund is " + r.getStatus() + "; only refunds that are waiting can be sent again");
			}
			claim(r);
		});
		return send(refundId);
	}

	/** Staff paid the buyer another way (bank transfer, cash): the refund is done. */
	public Refund paidByHand(UUID refundId, String reference, String note, String by) {
		if (reference == null || reference.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REFERENCE_REQUIRED",
					"Write the bank transfer or receipt number, so the payment can be found later.");
		}
		tx.executeWithoutResult(s -> {
			Refund r = closable(refundId);
			r.setStatus(RefundStatus.PAID_BY_HAND);
			r.setManualReference(cut(reference.trim(), 120));
			r.setStaffNote(note == null || note.isBlank() ? null : cut(note.trim(), 1000));
			r.setHandledBy(by);
			r.setNextTryAt(null);
			metrics.refundStatus(RefundStatus.PAID_BY_HAND.name());
			Order order = orders.lockById(r.getOrderId()).orElseThrow();
			updateOrderAfterRefund(order, r.getMerchantReference() + " " + r.getAmount() + " paid by hand by " + by
					+ " (ref " + r.getManualReference() + ")");
		});
		return refunds.findById(refundId).orElseThrow();
	}

	/** Staff: the money is no longer owed (e.g. the buyer kept the item). Frees the amount for another refund. */
	public Refund cancel(UUID refundId, String note, String by) {
		if (note == null || note.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NOTE_REQUIRED", "Write why the refund is no longer owed.");
		}
		tx.executeWithoutResult(s -> {
			Refund r = closable(refundId);
			r.setStatus(RefundStatus.CANCELLED);
			r.setStaffNote(cut(note.trim(), 1000));
			r.setHandledBy(by);
			r.setNextTryAt(null);
			metrics.refundStatus(RefundStatus.CANCELLED.name());
			orderService.note(orders.findById(r.getOrderId()).orElseThrow(), "REFUND_CANCELLED",
					r.getMerchantReference() + " " + r.getAmount() + " cancelled by " + by + ": " + r.getStaffNote());
		});
		return refunds.findById(refundId).orElseThrow();
	}

	public List<RefundAttempt> attemptsOf(UUID refundId) {
		return attemptLog.findByRefundIdOrderByAttemptNoAsc(refundId);
	}

	/** Sends the refunds whose wait is over. Returns how many were sent. */
	public int sendDue(Instant now, int max) {
		List<UUID> due = refunds.findDueForRetry(now, org.springframework.data.domain.PageRequest.of(0, max));
		int sent = 0;
		for (UUID id : due) {
			Boolean claimed = tx.execute(s -> {
				Refund r = refunds.lockById(id).orElseThrow();
				if (r.getNextTryAt() == null || r.getNextTryAt().isAfter(now) || !RESENDABLE.contains(r.getStatus())) {
					return false; // someone else sent it meanwhile
				}
				claim(r);
				return true;
			});
			if (Boolean.TRUE.equals(claimed)) {
				try {
					send(id);
					sent++;
				} catch (RuntimeException e) {
					log.warn("Refund retry {} failed: {}", id, e.getMessage());
				}
			}
		}
		return sent;
	}

	/** Marks refunds in review longer than {@link #STUCK_AFTER} so they show on the staff list. Returns how many. */
	public int flagStuck(Instant now) {
		List<UUID> stuck = refunds.findStuck(RefundStatus.PENDING, now.minus(STUCK_AFTER));
		for (UUID id : stuck) {
			tx.executeWithoutResult(s -> {
				Refund r = refunds.lockById(id).orElseThrow();
				if (r.getStatus() != RefundStatus.PENDING || r.getStuckAlertedAt() != null) {
					return;
				}
				r.setStuckAlertedAt(now);
				r.setNeedsStaffWhy("In review at BillPay for over 24 hours. Ask BillPay about refund "
						+ (r.getBillpayRefundId() != null ? r.getBillpayRefundId() : r.getMerchantReference()) + ".");
				orderService.note(orders.findById(r.getOrderId()).orElseThrow(), "REFUND_STUCK",
						r.getMerchantReference() + " still in review after 24 h");
			});
		}
		return stuck.size();
	}

	private Refund closable(UUID refundId) {
		Refund r = refunds.lockById(refundId).orElseThrow(() -> ApiException.notFound("Refund"));
		if (!CLOSABLE.contains(r.getStatus())) {
			throw new ApiException(HttpStatus.CONFLICT, "REFUND_NOT_CLOSABLE", r.getStatus() == RefundStatus.ERROR
					|| r.getStatus() == RefundStatus.PENDING || r.getStatus() == RefundStatus.REQUESTED
							? "BillPay may still send this refund. Wait until BillPay has said no before paying by hand or cancelling."
							: "This refund is already " + r.getStatus() + ".");
		}
		return r;
	}

	/** Ready to send again: a new key after a refusal (the old one would replay it), the same after no answer. */
	private void claim(Refund r) {
		boolean lastRefused = attemptLog.findByRefundIdOrderByAttemptNoAsc(r.getId()).stream()
				.reduce((a, b) -> b)
				.map(a -> a.getOutcome() == RefundAttempt.Outcome.REFUSED)
				.orElse(false);
		if (lastRefused) {
			r.setIdempotencyKey(UUID.randomUUID());
		}
		r.setStatus(RefundStatus.REQUESTED);
		r.setNextTryAt(null);
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
		refund.setAttempts(0);
		refund.setRequestPayload(billPay.toJson(new RefundRequest(amount,
				reason == null || reason.isBlank() ? DEFAULT_REASON : reason.trim())));
		refunds.save(refund);
		orderService.note(order, "REFUND_REQUESTED", refund.getMerchantReference() + " " + amount + " " + refund.getCurrency()
				+ (reason != null ? " (" + reason + ")" : ""));
		return refund;
	}

	private Refund send(UUID refundId) {
		Refund refund = refunds.findById(refundId).orElseThrow();
		var paidAttempt = attempts.findById(refund.getPaymentAttemptId()).orElseThrow();
		UUID key = refund.getIdempotencyKey();
		BillPayRefund response;
		try {
			// refund through the BillPay the payment was made in
			response = billPay.createRefund(paidAttempt.getEnvironment(), paidAttempt.getBillpayPaymentId(),
					refund.getRequestPayload(), key);
		} catch (BillPayException e) {
			int http = e.getHttpStatus();
			String code = reasonCodeFrom(e.getResponseBody(), null);
			if (RefundFailures.noAnswer(http)) {
				logAttempt(refundId, key, RefundAttempt.Outcome.NO_ANSWER, http, code, e.getMessage(), e.getResponseBody());
				tx.executeWithoutResult(s -> noAnswer(refundId, e.getMessage(), e.getResponseBody()));
			} else {
				logAttempt(refundId, key, RefundAttempt.Outcome.REFUSED, http, code, e.getMessage(), e.getResponseBody());
				refused(refundId, code != null ? code : "REJECTED_HTTP_" + http, e.getResponseBody(), e.getMessage(),
						"refund-response");
			}
			return refunds.findById(refundId).orElseThrow();
		}
		RefundStatus status = Optional.ofNullable(RefundStatus.fromBillPay(response.status())).orElse(RefundStatus.PENDING);
		logAttempt(refundId, key, status == RefundStatus.REFUSED ? RefundAttempt.Outcome.REFUSED : RefundAttempt.Outcome.ACCEPTED,
				200, response.reasonCode(), null, response.raw());
		apply(refundId, status, response, "refund-response");
		return refunds.findById(refundId).orElseThrow();
	}

	private void logAttempt(UUID refundId, UUID key, RefundAttempt.Outcome outcome, Integer http, String code,
			String error, String body) {
		tx.executeWithoutResult(s -> {
			Refund r = refunds.lockById(refundId).orElseThrow();
			RefundAttempt a = new RefundAttempt();
			a.setRefundId(refundId);
			a.setAttemptNo(attemptLog.findByRefundIdOrderByAttemptNoAsc(refundId).size() + 1);
			a.setIdempotencyKey(key);
			a.setOutcome(outcome);
			a.setHttpStatus(http);
			a.setReasonCode(code);
			a.setError(error == null ? null : cut(error, 2000));
			a.setResponsePayload(body);
			attemptLog.save(a);
			r.setAttempts(a.getAttemptNo());
		});
	}

	/** No answer: resend later with the same key, or hand to staff when the waits are used up. */
	private void noAnswer(UUID refundId, String error, String body) {
		Refund refund = refunds.lockById(refundId).orElseThrow();
		if (refund.getStatus().isFinal()) {
			return; // a webhook settled it meanwhile
		}
		refund.setError(error);
		refund.setResponsePayload(body);
		Order order = orders.findById(refund.getOrderId()).orElseThrow();
		Duration wait = waitAfter(RefundFailures.NO_ANSWER_WAITS, countOutcome(refundId, RefundAttempt.Outcome.NO_ANSWER));
		if (wait != null) {
			refund.setStatus(RefundStatus.ERROR);
			refund.setNextTryAt(Instant.now().plus(wait));
			metrics.refundStatus(RefundStatus.ERROR.name());
			orderService.note(order, "REFUND_REQUEST_FAILED", refund.getMerchantReference() + " " + error
					+ "; trying again in " + words(wait));
		} else {
			refund.setStatus(RefundStatus.NEEDS_STAFF);
			refund.setNextTryAt(null);
			refund.setNeedsStaffWhy("BillPay never answered after " + refund.getAttempts() + " tries. Check the BillPay"
					+ " dashboard for this refund before trying again or paying by hand.");
			metrics.refundStatus(RefundStatus.NEEDS_STAFF.name());
			orderService.note(order, "REFUND_NEEDS_STAFF", refund.getMerchantReference() + " no answer from BillPay");
		}
	}

	/** BillPay said no: try again later if it may pass, else hand to staff. The refund stays owed either way. */
	private void refused(UUID refundId, String code, String body, String error, String source) {
		boolean[] tellBuyer = { false };
		UUID[] buyer = { null };
		String[] notice = { null };
		tx.executeWithoutResult(s -> {
			Refund refund = refunds.lockById(refundId).orElseThrow();
			if (refund.getStatus().isFinal()) {
				log.info("Ignoring refusal for refund {} already {} ({})", refund.getMerchantReference(),
						refund.getStatus(), source);
				return;
			}
			refund.setReasonCode(code);
			refund.setError(error);
			if (body != null) {
				refund.setResponsePayload(body);
			}
			RefundFailures.Decision d = RefundFailures.classify(code, body != null ? body : error);
			long refusals = countOutcome(refundId, RefundAttempt.Outcome.REFUSED);
			Duration wait = switch (d.kind()) {
				case RETRY -> waitAfter(RefundFailures.RETRY_WAITS, refusals);
				case RETRY_ONCE -> refusals <= 1 ? RefundFailures.RETRY_WAITS.getFirst() : null;
				case STAFF, MISMATCH -> null;
			};
			Order order = orders.findById(refund.getOrderId()).orElseThrow();
			if (wait != null) {
				refund.setStatus(RefundStatus.RETRY_LATER);
				refund.setNextTryAt(Instant.now().plus(wait));
				refund.setNeedsStaffWhy(d.why());
				metrics.refundStatus(RefundStatus.RETRY_LATER.name());
				orderService.note(order, "REFUND_RETRY_LATER", refund.getMerchantReference() + " " + code
						+ "; trying again in " + words(wait) + " (via " + source + ")");
			} else {
				refund.setStatus(RefundStatus.NEEDS_STAFF);
				refund.setNextTryAt(null);
				refund.setNeedsStaffWhy(d.kind() == RefundFailures.Kind.STAFF || d.kind() == RefundFailures.Kind.MISMATCH
						? d.why() : "Tried " + refund.getAttempts() + " times; BillPay still says " + code + ". " + d.why());
				metrics.refundStatus(RefundStatus.NEEDS_STAFF.name());
				orderService.note(order, "REFUND_REFUSED", refund.getMerchantReference() + " " + code + " (via " + source
						+ "); waiting for staff");
				tellBuyer[0] = true;
				buyer[0] = order.getUserId();
				notice[0] = order.getOrderNumber() + "|" + refund.getAmount() + "|" + refund.getMerchantReference();
			}
		});
		if (tellBuyer[0]) {
			String[] p = notice[0].split("\\|");
			inbox.notify(buyer[0], InboxItem.Kind.PAYMENT, "Your refund is delayed",
					"BillPay couldn't send your refund of " + p[1] + " birr for order " + p[0]
							+ " yet. Our team is on it and will contact you if we need anything.",
					"/orders/track?order=" + p[0], "refund-delayed:" + p[2]);
		}
	}

	private long countOutcome(UUID refundId, RefundAttempt.Outcome outcome) {
		return attemptLog.findByRefundIdOrderByAttemptNoAsc(refundId).stream().filter(a -> a.getOutcome() == outcome)
				.count();
	}

	/** The wait before try number {@code done + 1}, or null when the list is used up. */
	private static Duration waitAfter(List<Duration> waits, long done) {
		return done >= 1 && done <= waits.size() ? waits.get((int) done - 1) : null;
	}

	private static String words(Duration d) {
		return d.toHours() >= 1 ? d.toHours() + " h" : d.toMinutes() + " min";
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

	/** Applies a refund status from BillPay (response or webhook). A refusal keeps the refund owed. */
	public Outcome apply(UUID refundId, RefundStatus next, BillPayRefund reported, String source) {
		if (next == RefundStatus.REFUSED) {
			Refund current = refunds.findById(refundId).orElseThrow();
			if (current.getStatus().isFinal()) {
				return Outcome.IGNORED;
			}
			if (current.getStatus() == RefundStatus.NEEDS_STAFF || current.getStatus() == RefundStatus.RETRY_LATER) {
				return Outcome.DUPLICATE; // this refusal is already being handled
			}
			String code = reported.reasonCode() != null ? reported.reasonCode() : "REFUND_REFUSED";
			refused(refundId, code, reported.raw(), "BillPay refused the refund (" + code + ")", source);
			return Outcome.APPLIED;
		}
		return tx.execute(s -> {
			Refund refund = refunds.lockById(refundId).orElseThrow();
			RefundStatus current = refund.getStatus();
			if (reported.refundId() != null
					&& (refund.getBillpayRefundId() == null || !reported.refundId().equals(refund.getBillpayRefundId()))
					&& "refund-response".equals(source)) {
				refund.setBillpayRefundId(reported.refundId()); // the latest accepted try is the one BillPay works on
			} else if (reported.refundId() != null && refund.getBillpayRefundId() == null) {
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
			refund.setNextTryAt(null);
			refund.setNeedsStaffWhy(null);
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
				.filter(r -> r.getStatus().isRefunded())
				.map(Refund::getAmount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal kept = totalPaid.subtract(totalRefunded);

		if (kept.signum() <= 0) {
			orderService.cancelHeldEarnings(order);
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
					EnumSet.of(RefundStatus.REQUESTED, RefundStatus.PENDING, RefundStatus.ERROR, RefundStatus.RETRY_LATER,
							RefundStatus.NEEDS_STAFF));
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
			r.setReason("Issued outside Sodo Gebeya");
			r.setStatus(RefundStatus.PENDING);
			r.setExternal(true);
			r.setResponsePayload(reported.raw());
			return refunds.save(r).getId();
		});
		return apply(externalId, RefundStatus.SUCCEEDED, reported, source);
	}

	private static String cut(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}
}
