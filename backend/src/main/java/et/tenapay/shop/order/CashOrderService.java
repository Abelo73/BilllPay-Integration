package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.dispute.DisputeService;
import et.tenapay.shop.events.OrderEventPublisher;
import et.tenapay.shop.payout.PayoutService;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * M7 cash on delivery: the seller (or staff) marks a parcel's cash as received at the door. The parcel becomes
 * delivered, our commission is charged to the seller's balance, and once every parcel still in the order is
 * collected the order is PAID.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CashOrderService {

	public record Result(String orderNumber, int parcelNo, BigDecimal collected, BigDecimal commission, boolean orderPaid) {
	}

	private final OrderRepository orders;
	private final OrderParcelRepository parcels;
	private final OrderService orderService;
	private final OrderEventRepository events;
	private final OrderEventPublisher publisher;
	private final PayoutService payouts;
	private final ShopRepository shops;

	/** The seller collected the cash for their own parcel of this order. */
	@Transactional
	public Result bySeller(String orderNumber, Long shopId, String shopName) {
		return collect(orderNumber, p -> shopId != null && shopId.equals(p.getShopId()), "seller " + shopName);
	}

	/** Staff record the cash for one parcel (e.g. Sodo Gebeya's own items, or a seller who forgot to tap it). */
	@Transactional
	public Result byStaff(String orderNumber, int parcelNo, String staff) {
		return collect(orderNumber, p -> p.getParcelNo() == parcelNo, staff);
	}

	private Result collect(String orderNumber, Predicate<OrderParcel> which, String by) {
		Order found = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		Order order = orders.lockById(found.getId()).orElseThrow();
		if (!order.cash()) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_CASH", "This order was paid online through BillPay; there is no cash to collect.");
		}
		List<OrderParcel> all = parcels.lockByOrderId(order.getId());
		OrderParcel p = all.stream().filter(which).findFirst().orElseThrow(() -> ApiException.notFound("Order"));
		if (p.getCashCollectedAt() != null) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_COLLECTED", "The cash for this is already marked as received.");
		}
		FulfilmentStatus st = p.getFulfilmentStatus();
		if (st == null || st == FulfilmentStatus.CANCELLED) {
			throw new ApiException(HttpStatus.CONFLICT, "PARCEL_CANCELLED", "This part of the order was cancelled; there is nothing to collect.");
		}

		Instant now = Instant.now();
		p.setCashCollectedAt(now);
		boolean nowDelivered = st != FulfilmentStatus.DELIVERED;
		if (nowDelivered) {
			p.setFulfilmentStatus(FulfilmentStatus.DELIVERED);
			p.setDeliveredAt(now);
		}
		BigDecimal collected = DisputeService.parcelPaid(p);
		BigDecimal commission = payouts.chargeCashCommission(order, p);
		orderService.rollUp(order, all);

		String number = p.number(order.getOrderNumber());
		String seller = p.getShopId() == null ? "Sodo Gebeya" : shops.findById(p.getShopId()).map(Shop::getName).orElse("seller");
		events.save(new OrderEvent(order.getId(), "CASH_PARCEL_COLLECTED", order.getStatus(), order.getStatus(),
				"parcel " + number + " (" + seller + "): " + collected + " ETB cash received by " + by
						+ (commission.signum() > 0 ? "; commission " + commission + " ETB charged to the seller" : "")));
		if (nowDelivered) {
			Map<String, Object> extra = new HashMap<>();
			extra.put("fulfilmentStatus", FulfilmentStatus.DELIVERED.name());
			if (all.size() > 1) {
				extra.put("parcel", number);
				extra.put("seller", seller);
				extra.put("parcels", all.size());
			}
			publisher.publish(order, "order.fulfilment.delivered", extra);
		}

		boolean everyParcelCollected = all.stream().filter(x -> x.getFulfilmentStatus() != FulfilmentStatus.CANCELLED)
				.allMatch(x -> x.getCashCollectedAt() != null);
		boolean paid = false;
		if (everyParcelCollected && order.getStatus() == OrderStatus.CASH_ON_DELIVERY) {
			order.setPaidAt(now);
			orderService.transition(order, OrderStatus.PAID, "CASH_COLLECTED", "cash on delivery: all " + order.getTotal() + " ETB received");
			paid = true;
		}
		log.info("Order {} parcel {}: cash {} ETB received by {} (commission {})", order.getOrderNumber(), p.getParcelNo(), collected, by, commission);
		return new Result(order.getOrderNumber(), p.getParcelNo(), collected, commission, paid);
	}
}
