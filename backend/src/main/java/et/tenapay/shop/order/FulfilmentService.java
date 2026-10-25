package et.tenapay.shop.order;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.events.OrderEventPublisher;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Delivery progress of paid orders, and cancelling orders that were never paid. */
@Slf4j
@Service
@RequiredArgsConstructor
public class FulfilmentService {

	private final OrderRepository orders;
	private final OrderService orderService;
	private final PaymentAttemptRepository attempts;
	private final OrderEventPublisher publisher;
	private final OrderEventRepository events;
	private final OrderParcelRepository parcels;
	private final et.tenapay.shop.seller.ShopRepository shops;

	/**
	 * Cancels an order that hasn't been paid and releases its stock. BillPay's open checkout link is left to expire;
	 * if the shopper still pays on it, the order goes to REVIEW_REQUIRED (late payment) for a refund.
	 */
	@Transactional
	public Order cancelUnpaid(String orderNumber, String reason, String by) {
		Order order = lock(orderNumber);
		if (!order.getStatus().awaitingPayment()) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_CANCELLABLE",
					order.getStatus() == OrderStatus.CANCELLED ? "This order is already cancelled."
							: "Only unpaid orders can be cancelled here (this one is " + label(order.getStatus()) + ").");
		}
		for (PaymentAttempt a : attempts.findByOrderIdOrderByAttemptNoAsc(order.getId())) {
			if (!a.getStatus().isFinal()) {
				a.setStatus(PaymentStatus.CANCELLED);
			}
		}
		orderService.releaseReservations(order);
		order.setCancelledAt(Instant.now());
		orderService.transition(order, OrderStatus.CANCELLED, "CANCELLED",
				"by " + by + (reason == null || reason.isBlank() ? "" : ": " + reason.trim()));
		return order;
	}

	/**
	 * Moves a whole paid order forward (staff): every parcel that can take this step does; the others (already
	 * further along, or cancelled) stay as they are. Cancelling a paid order cancels the parcels not yet sent.
	 */
	@Transactional
	public Order advance(String orderNumber, FulfilmentStatus to, String note, String by) {
		Order order = lock(orderNumber);
		FulfilmentStatus from = order.getFulfilmentStatus();
		if (from == null) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAID",
					"Only paid orders can be fulfilled (this one is " + label(order.getStatus()) + ").");
		}
		List<OrderParcel> all = parcels.lockByOrderId(order.getId());
		List<OrderParcel> moving = all.stream()
				.filter(p -> p.getFulfilmentStatus() != null && p.getFulfilmentStatus().next().contains(to)).toList();
		if (!from.next().contains(to) || moving.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "INVALID_FULFILMENT_STEP",
					"Can't go from " + label(from) + " to " + label(to) + ".",
					Map.of("from", from.name(), "allowed", from.next().stream().map(Enum::name).toList()));
		}
		String text = blankToNull(note);
		Instant now = Instant.now();
		moving.forEach(p -> step(p, to, text, now));
		orderService.rollUp(order, all); // cancelled only if every parcel is
		String detail = label(from) + " → " + label(to) + " by " + by + (text != null ? ": " + text : "")
				+ (to == FulfilmentStatus.CANCELLED ? " (paid order: refund the customer)" : "");
		events.save(new OrderEvent(order.getId(), "FULFILMENT_" + to.name(), order.getStatus(), order.getStatus(), detail));
		Map<String, Object> extra = new HashMap<>();
		extra.put("fulfilmentStatus", to.name());
		if (text != null) {
			extra.put("note", text);
		}
		publisher.publish(order, "order.fulfilment." + to.name().toLowerCase(), extra);
		log.info("Order {} fulfilment {} -> {}", order.getOrderNumber(), from, to);
		return order;
	}

	/**
	 * Moves one seller's parcel forward. {@code shopId} is the seller doing it (they may only touch their own parcel
	 * and never cancel a paid one); null = staff. The buyer is told about each parcel; the order follows its parcels.
	 */
	@Transactional
	public OrderParcel advanceParcel(String orderNumber, int parcelNo, FulfilmentStatus to, String note, String by,
			Long sellerShopId) {
		Order order = lock(orderNumber);
		List<OrderParcel> all = parcels.lockByOrderId(order.getId());
		OrderParcel parcel = all.stream().filter(p -> p.getParcelNo() == parcelNo).findFirst()
				.filter(p -> sellerShopId == null || sellerShopId.equals(p.getShopId()))
				.orElseThrow(() -> ApiException.notFound("Parcel"));
		FulfilmentStatus from = parcel.getFulfilmentStatus();
		if (from == null) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAID", "Only paid orders can be fulfilled.");
		}
		if (sellerShopId != null && (to == FulfilmentStatus.CANCELLED || to == FulfilmentStatus.UNFULFILLED)) {
			throw new ApiException(HttpStatus.FORBIDDEN, "SELLER_CANNOT_CANCEL",
					"A paid order can only be cancelled by Sodo Gebeya, because the buyer gets a refund. Call us.");
		}
		if (!from.next().contains(to)) {
			throw new ApiException(HttpStatus.CONFLICT, "INVALID_FULFILMENT_STEP",
					"Can't go from " + label(from) + " to " + label(to) + ".",
					Map.of("from", from.name(), "allowed", from.next().stream().map(Enum::name).toList()));
		}
		String text = blankToNull(note);
		step(parcel, to, text, Instant.now());
		orderService.rollUp(order, all);
		String seller = parcel.getShopId() == null ? "Sodo Gebeya"
				: shops.findById(parcel.getShopId()).map(et.tenapay.shop.seller.Shop::getName).orElse("seller");
		String number = parcel.number(order.getOrderNumber());
		String detail = "parcel " + number + " (" + seller + ") " + label(from) + " → " + label(to) + " by " + by
				+ (text != null ? ": " + text : "") + (to == FulfilmentStatus.CANCELLED ? " (refund this parcel)" : "");
		events.save(new OrderEvent(order.getId(), "FULFILMENT_" + to.name(), order.getStatus(), order.getStatus(), detail));
		Map<String, Object> extra = new HashMap<>();
		extra.put("fulfilmentStatus", to.name());
		if (all.size() > 1) {
			// only for orders with several sellers, so a single-seller buyer isn't told about "part of" the order
			extra.put("parcel", number);
			extra.put("seller", seller);
			extra.put("parcels", all.size());
		}
		if (text != null) {
			extra.put("note", text);
		}
		publisher.publish(order, "order.fulfilment." + to.name().toLowerCase(), extra);
		log.info("Order {} parcel {} fulfilment {} -> {}", order.getOrderNumber(), parcelNo, from, to);
		return parcel;
	}

	private static void step(OrderParcel p, FulfilmentStatus to, String text, Instant now) {
		p.setFulfilmentStatus(to);
		switch (to) {
			case SHIPPED -> {
				p.setShippedAt(now);
				p.setTrackingNote(text);
			}
			case DELIVERED -> p.setDeliveredAt(now);
			case CANCELLED -> p.setCancelledAt(now);
			default -> {
			}
		}
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}

	private Order lock(String orderNumber) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		return orders.lockById(order.getId()).orElseThrow();
	}

	private static String label(Enum<?> e) {
		return e.name().replace('_', ' ').toLowerCase();
	}
}
