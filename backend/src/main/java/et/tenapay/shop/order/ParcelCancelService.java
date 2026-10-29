package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.dispute.DisputeService;
import et.tenapay.shop.payout.EarningStatus;
import et.tenapay.shop.refund.Refund;
import et.tenapay.shop.refund.RefundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Cancels a PAID parcel before it is sent, and gives the buyer that parcel's money back through BillPay.
 * <ul>
 * <li>the buyer: while the seller hasn't started preparing it (UNFULFILLED)</li>
 * <li>the seller: their own parcel, before it ships (out of stock, can't deliver), with a reason</li>
 * <li>staff: any parcel before it ships, with a reason</li>
 * </ul>
 * BillPay is asked first: if it refuses (e.g. the merchant's refund limit) or can't be reached, nothing is cancelled
 * and the person is told why. Only then is the parcel cancelled (its held earning is cancelled, the buyer is told)
 * and its items go back on sale.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ParcelCancelService {

	public enum Who { BUYER, SELLER, STAFF }

	public record Result(String orderNumber, int parcelNo, BigDecimal refunded, String refundStatus) {
	}

	private final OrderRepository orders;
	private final OrderParcelRepository parcels;
	private final RefundService refunds;
	private final FulfilmentService fulfilment;
	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final OrderService orderService;

	/** The buyer cancels one parcel of their own order before the seller starts preparing it. */
	public Result byBuyer(UUID buyerId, String orderNumber, int parcelNo, String reason) {
		Order order = order(orderNumber);
		if (buyerId == null || !buyerId.equals(order.getUserId())) {
			throw ApiException.notFound("Order");
		}
		return cancel(order, parcel(order, parcelNo), reason, Who.BUYER, "buyer");
	}

	/** The seller cancels their own parcel of an order before it ships. */
	public Result bySeller(Long shopId, String shopName, String orderNumber, String reason) {
		Order order = order(orderNumber);
		OrderParcel p = parcels.findByOrderIdOrderByParcelNoAsc(order.getId()).stream()
				.filter(x -> shopId != null && shopId.equals(x.getShopId())).findFirst()
				.orElseThrow(() -> ApiException.notFound("Order"));
		return cancel(order, p, reason, Who.SELLER, "seller " + shopName);
	}

	/** Staff cancel one parcel before it ships. */
	public Result byStaff(String orderNumber, int parcelNo, String reason, String staff) {
		Order order = order(orderNumber);
		return cancel(order, parcel(order, parcelNo), reason, Who.STAFF, staff);
	}

	/** Staff cancel a whole paid order: every parcel not yet sent is cancelled and refunded. */
	public List<Result> orderByStaff(String orderNumber, String reason, String staff) {
		Order order = order(orderNumber);
		List<Result> done = new ArrayList<>();
		for (OrderParcel p : parcels.findByOrderIdOrderByParcelNoAsc(order.getId())) {
			boolean open = order.cash() ? p.getCashCollectedAt() == null : p.getPayoutStatus() == EarningStatus.HELD;
			if (open && cancellable(p.getFulfilmentStatus())) {
				done.add(cancel(order, p, reason, Who.STAFF, staff));
			}
		}
		if (done.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "NOTHING_TO_CANCEL",
					"Every part of this order is already on its way, delivered, paid out or cancelled.");
		}
		return done;
	}

	private Result cancel(Order order, OrderParcel p, String reason, Who who, String by) {
		String why = reason == null || reason.isBlank() ? null : reason.trim();
		if (who != Who.BUYER && why == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Say why it's cancelled; the buyer sees it.");
		}
		FulfilmentStatus st = p.getFulfilmentStatus();
		if (st == null) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAID",
					"This order isn't paid, so there's nothing to refund: cancel it from the order page instead.");
		}
		if (st == FulfilmentStatus.CANCELLED || p.getPayoutStatus() == EarningStatus.CANCELLED) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_CANCELLED", "This part of the order is already cancelled.");
		}
		if (!cancellable(st)) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_SENT",
					"It's already on its way or delivered. Once it arrives, report a problem instead.");
		}
		boolean cash = order.cash(); // M7: nothing was paid yet, so there is nothing to refund
		if (cash && p.getCashCollectedAt() != null) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_SENT", "The cash for this was already collected.");
		}
		if (!cash && p.getPayoutStatus() != EarningStatus.HELD) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PAID_OUT",
					"The seller has already been paid for this. Contact Sodo Gebeya support.");
		}
		if (who == Who.BUYER && st != FulfilmentStatus.UNFULFILLED) {
			throw new ApiException(HttpStatus.CONFLICT, "SELLER_STARTED",
					"The seller is already preparing it. Ask them in Chats, or report a problem after it arrives.");
		}
		Long openProblems = jdbc.queryForObject("select count(*) from disputes where parcel_id = ? and status = 'OPEN'",
				Long.class, p.getId());
		if (openProblems != null && openProblems > 0) {
			throw new ApiException(HttpStatus.CONFLICT, "PROBLEM_OPEN",
					"There's an open problem about this; settle it there (refund or part refund) instead.");
		}

		BigDecimal amount = cash ? BigDecimal.ZERO : DisputeService.parcelPaid(p);
		String number = p.number(order.getOrderNumber());
		String status = cash ? "CASH_NOT_COLLECTED" : "NOTHING_TO_REFUND";
		if (amount.signum() > 0) {
			// The refund is owed from here on: if BillPay refuses or doesn't answer, it is tried again or handed to
			// staff (Admin -> Refunds), so the cancel goes ahead either way.
			Refund r = refunds.create(order.getOrderNumber(), amount,
					"Cancelled before sending (" + label(who) + ")" + (why != null ? ": " + why : ""), null);
			status = r.getStatus().name();
		}
		// the money is on its way back: cancel the parcel (its held earning is cancelled, the buyer is told)
		String note = (cash ? "Cash order cancelled before payment" : "Refund of " + amount + " birr") + (why != null ? ". " + why : "");
		fulfilment.advanceParcel(order.getOrderNumber(), p.getParcelNo(), FulfilmentStatus.CANCELLED, note, by, null);
		restock(order.getId(), p.getParcelNo());
		if (cash) {
			closeCashOrderIfAllCancelled(order.getId(), by);
		}
		log.info("Parcel {} cancelled by {} before sending; refund {} ETB ({})", number, by, amount, status);
		return new Result(order.getOrderNumber(), p.getParcelNo(), amount, status);
	}

	/** The parcel's items go back on sale (they were taken out of stock when the order was paid). */
	private void restock(UUID orderId, int parcelNo) {
		tx.executeWithoutResult(s -> {
			Order o = orders.findById(orderId).orElseThrow();
			for (OrderItem i : o.getItems()) {
				if (i.getProductId() != null && (i.getParcelNo() == null || i.getParcelNo() == parcelNo)) {
					jdbc.update("update products set stock = stock + ?, version = version + 1 where id = ?", i.getQuantity(),
							i.getProductId());
				}
			}
		});
	}

	/** A cash order whose every parcel is cancelled is itself cancelled (no refund: nothing was paid). */
	private void closeCashOrderIfAllCancelled(UUID orderId, String by) {
		tx.executeWithoutResult(s -> {
			Order o = orders.lockById(orderId).orElseThrow();
			boolean allCancelled = parcels.findByOrderIdOrderByParcelNoAsc(orderId).stream()
					.allMatch(x -> x.getFulfilmentStatus() == FulfilmentStatus.CANCELLED);
			if (allCancelled && o.getStatus() == OrderStatus.CASH_ON_DELIVERY) {
				orderService.releaseDiscount(o);
				o.setCancelledAt(java.time.Instant.now());
				orderService.transition(o, OrderStatus.CANCELLED, "CANCELLED", "cash order cancelled by " + by + " before delivery");
			}
		});
	}

	private static boolean cancellable(FulfilmentStatus st) {
		return st == FulfilmentStatus.UNFULFILLED || st == FulfilmentStatus.PROCESSING;
	}

	private static String label(Who who) {
		return switch (who) {
			case BUYER -> "by the buyer";
			case SELLER -> "by the seller";
			case STAFF -> "by Sodo Gebeya";
		};
	}

	private Order order(String orderNumber) {
		return orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
	}

	private OrderParcel parcel(Order order, int parcelNo) {
		return parcels.findByOrderIdOrderByParcelNoAsc(order.getId()).stream().filter(x -> x.getParcelNo() == parcelNo)
				.findFirst().orElseThrow(() -> ApiException.notFound("Parcel"));
	}
}
