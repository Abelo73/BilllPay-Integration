package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.Area;
import et.tenapay.shop.catalog.AreaRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.delivery.RiderRepository;
import et.tenapay.shop.payment.PaymentAttempt;
import et.tenapay.shop.payment.PaymentAttemptRepository;
import et.tenapay.shop.payment.PaymentStatus;
import et.tenapay.shop.refund.Refund;
import et.tenapay.shop.refund.RefundRepository;
import et.tenapay.shop.refund.RefundStatus;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;

/**
 * The buyer's receipt (after payment) and detailed delivery tracking with map points.
 * Same access rule as the order page: the signed-in owner, or a guest with the checkout phone.
 */
@RestController
@RequestMapping("/api/orders/{orderNumber}")
@RequiredArgsConstructor
public class OrderReceiptController {

	/** Centre of Wolaita Sodo, used when an area has no map point. */
	static final BigDecimal SODO_LAT = new BigDecimal("6.855000");
	static final BigDecimal SODO_LNG = new BigDecimal("37.757000");

	private final OrderRepository orders;
	private final PaymentAttemptRepository attempts;
	private final RefundRepository refunds;
	private final OrderParcelRepository parcels;
	private final OrderEventRepository events;
	private final ShopRepository shops;
	private final AreaRepository areas;
	private final RiderRepository riders;
	private final et.tenapay.shop.payment.billpay.BillPayMode billPayMode;

	// ---------------- receipt ----------------

	public record ReceiptLine(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal, String seller) {
	}

	public record ReceiptRefund(BigDecimal amount, String status, Instant at) {
	}

	public record ReceiptView(String receiptNumber, String orderNumber, String status, Instant orderedAt, Instant paidAt,
			String customerName, String customerPhone, String customerEmail, String deliveryAddress, String deliveryArea,
			List<ReceiptLine> lines, BigDecimal subtotal, String discountCode, BigDecimal discountAmount, BigDecimal deliveryFee,
			BigDecimal total, String currency,
			/** BILLPAY or CASH */
			String paymentMethod,
			/** How the buyer paid inside BillPay (e.g. TELEBIRR, BILLBANK); null for cash */
			String paidWith, String billpayPaymentId, String paymentReference,
			/** SANDBOX = a test payment, no real money */
			String environment, List<ReceiptRefund> refunds, BigDecimal refundedTotal, BigDecimal netPaid) {
	}

	@GetMapping("/receipt")
	@Transactional(readOnly = true)
	public ReceiptView receipt(@PathVariable String orderNumber, @RequestParam(required = false) String phone) {
		Order o = findOwned(orderNumber, phone);
		List<OrderParcel> list = parcels.findByOrderIdOrderByParcelNoAsc(o.getId());
		boolean cashPaid = o.cash() && list.stream().anyMatch(p -> p.getCashCollectedAt() != null);
		if (o.getPaidAt() == null && !cashPaid) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_PAID", "The receipt is ready once the order is paid.");
		}
		Map<Long, String> shopNames = shopNames(o.getItems().stream().map(OrderItem::getShopId).toList());
		List<ReceiptLine> lines = o.getItems().stream()
				.map(i -> new ReceiptLine(i.getProductName(), i.getQuantity(), i.getUnitPrice(), i.getLineTotal(),
						i.getShopId() == null ? "Sodo Gebeya" : shopNames.getOrDefault(i.getShopId(), "Seller")))
				.toList();
		PaymentAttempt paid = attempts.findByOrderIdOrderByAttemptNoAsc(o.getId()).stream()
				.filter(a -> a.getStatus() == PaymentStatus.SUCCEEDED).reduce((a, b) -> b).orElse(null);
		List<ReceiptRefund> refundRows = refunds.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
				.filter(r -> r.getStatus() != RefundStatus.ERROR && r.getStatus() != RefundStatus.REFUSED
						&& r.getStatus() != RefundStatus.CANCELLED)
				.map(r -> new ReceiptRefund(r.getAmount(), r.getStatus().name(), r.getCreatedAt())).toList();
		BigDecimal refunded = refunds.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
				.filter(r -> r.getStatus() == RefundStatus.SUCCEEDED || r.getStatus() == RefundStatus.PAID_BY_HAND).map(Refund::getAmount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		Instant paidAt = o.getPaidAt() != null ? o.getPaidAt()
				: list.stream().map(OrderParcel::getCashCollectedAt).filter(Objects::nonNull).min(Instant::compareTo).orElse(null);
		return new ReceiptView("R-" + o.getOrderNumber(), o.getOrderNumber(), o.getStatus().name(), o.getCreatedAt(), paidAt,
				o.getCustomerName(), maskPhone(o.getCustomerPhone()), o.getCustomerEmail(), o.getDeliveryAddress(),
				o.getDeliveryArea(), lines, o.getSubtotal(), o.getDiscountCode(), o.getDiscountAmount(), o.getDeliveryFee(),
				o.getTotal(), o.getCurrency(), o.getPaymentMethod().name(),
				paid == null ? null : paid.getPaymentMethod(), paid == null ? null : paid.getBillpayPaymentId(),
				paid == null ? null : paid.getMerchantReference(),
				paid == null ? (billPayMode.isSandbox() ? "SANDBOX" : "LIVE") : paid.getEnvironment().name(),
				refundRows, refunded, o.getTotal().subtract(refunded));
	}

	// ---------------- tracking ----------------

	public record MapPoint(String label, BigDecimal lat, BigDecimal lng,
			/** false = the area has no map point yet, the centre of Sodo is shown */
			boolean exact) {
	}

	/** One step of the parcel's journey; {@code at} null = not reached yet. */
	public record TrackStep(String key, Instant at, String place, String detail) {
	}

	public record ParcelTracking(int parcelNo, String number, String seller, String fulfilmentStatus, MapPoint from,
			MapPoint to, List<TrackStep> steps, String riderName, String riderPhone, String trackingNote) {
	}

	public record TrackingView(String orderNumber, String status, String paymentMethod, String deliveryAddress,
			String deliveryArea, List<ParcelTracking> parcels) {
	}

	@GetMapping("/tracking")
	@Transactional(readOnly = true)
	public TrackingView tracking(@PathVariable String orderNumber, @RequestParam(required = false) String phone) {
		Order o = findOwned(orderNumber, phone);
		List<OrderParcel> list = parcels.findByOrderIdOrderByParcelNoAsc(o.getId());
		Map<Long, Shop> shopById = new HashMap<>();
		shops.findAllById(list.stream().map(OrderParcel::getShopId).filter(Objects::nonNull).toList())
				.forEach(s -> shopById.put(s.getId(), s));
		Map<String, Area> areaByName = new HashMap<>();
		areas.findAllByOrderBySortOrderAscIdAsc().forEach(a -> areaByName.put(a.getName().toLowerCase(), a));
		List<OrderEvent> history = events.findByOrderIdOrderByCreatedAtAscIdAsc(o.getId());
		String buyerPlace = o.getDeliveryArea() != null ? o.getDeliveryArea() : "Sodo";
		MapPoint to = point(buyerPlace, areaByName);

		List<ParcelTracking> out = new ArrayList<>();
		for (OrderParcel p : list) {
			Shop sh = p.getShopId() == null ? null : shopById.get(p.getShopId());
			String seller = sh == null ? "Sodo Gebeya" : sh.getName();
			String sellerArea = sh == null || sh.getArea() == null ? "Sodo" : sh.getArea();
			String number = p.number(o.getOrderNumber());
			String sellerPlace = seller + " · " + sellerArea;
			FulfilmentStatus fs = p.getFulfilmentStatus();
			var rider = p.getRiderId() == null ? null : riders.findById(p.getRiderId()).orElse(null);
			boolean onTheWay = fs == FulfilmentStatus.SHIPPED;

			List<TrackStep> steps = new ArrayList<>();
			steps.add(new TrackStep("ORDERED", o.getCreatedAt(), "Sodo Gebeya", null));
			if (o.cash()) {
				steps.add(new TrackStep("PAY_AT_DOOR", null, buyerPlace, null));
			} else {
				steps.add(new TrackStep("PAID", o.getPaidAt(), "BillPay", null));
			}
			steps.add(new TrackStep("PACKING", firstEvent(history, "FULFILMENT_PROCESSING", number), sellerPlace, null));
			steps.add(new TrackStep("RIDER_ASSIGNED", p.getRiderAssignedAt(), sellerPlace,
					rider == null ? null : rider.getName()));
			steps.add(new TrackStep("ON_THE_WAY", p.getShippedAt(), sellerArea + " → " + buyerPlace, p.getTrackingNote()));
			if (o.cash()) {
				steps.add(new TrackStep("CASH_PAID", p.getCashCollectedAt(), buyerPlace, null));
			}
			steps.add(new TrackStep("DELIVERED", p.getDeliveredAt(), buyerPlace, null));
			steps.add(new TrackStep("RECEIVED", p.getReceivedAt(), buyerPlace, null));
			if (fs == FulfilmentStatus.CANCELLED) {
				steps.add(new TrackStep("CANCELLED", p.getCancelledAt(), sellerPlace, null));
			}
			out.add(new ParcelTracking(p.getParcelNo(), number, seller, fs == null ? null : fs.name(),
					point(sellerArea, areaByName, seller), to, steps,
					rider == null ? null : rider.getName(),
					// the phone only while it's on the way (plans can change before)
					rider != null && onTheWay ? rider.getPhone() : null, p.getTrackingNote()));
		}
		return new TrackingView(o.getOrderNumber(), o.getStatus().name(), o.getPaymentMethod().name(),
				o.getDeliveryAddress(), o.getDeliveryArea(), out);
	}

	/** When this parcel reached a step, from the order history ("parcel TS-…-2 (Shop) Paid → Processing …"). */
	private static Instant firstEvent(List<OrderEvent> history, String type, String parcelNumber) {
		return history.stream()
				.filter(e -> type.equals(e.getType()))
				.filter(e -> e.getDetail() == null || !e.getDetail().startsWith("parcel ")
						|| e.getDetail().startsWith("parcel " + parcelNumber + " "))
				.map(OrderEvent::getCreatedAt).findFirst().orElse(null);
	}

	private static MapPoint point(String areaName, Map<String, Area> areaByName) {
		return point(areaName, areaByName, areaName);
	}

	private static MapPoint point(String areaName, Map<String, Area> areaByName, String label) {
		Area a = areaName == null ? null : areaByName.get(areaName.toLowerCase());
		if (a != null && a.getLat() != null && a.getLng() != null) {
			return new MapPoint(label, a.getLat(), a.getLng(), true);
		}
		return new MapPoint(label, SODO_LAT, SODO_LNG, false);
	}

	private Map<Long, String> shopNames(List<Long> ids) {
		Map<Long, String> names = new HashMap<>();
		shops.findAllById(ids.stream().filter(Objects::nonNull).distinct().toList()).forEach(s -> names.put(s.getId(), s.getName()));
		return names;
	}

	/** +251911223344 → +251 9** *** 344, so a printed or forwarded receipt doesn't spread the full number. */
	static String maskPhone(String phone) {
		if (phone == null || phone.length() < 7) {
			return phone;
		}
		String digits = phone.replaceAll("\\s", "");
		return digits.substring(0, Math.min(4, digits.length() - 3)) + " " + "*".repeat(Math.max(0, digits.length() - 7)) + " "
				+ digits.substring(digits.length() - 3);
	}

	private Order findOwned(String orderNumber, String phone) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		boolean ownedBySignedInCustomer = order.getUserId() != null
				&& CurrentUser.customerId().filter(order.getUserId()::equals).isPresent();
		if (!ownedBySignedInCustomer && !CheckoutService.samePhone(order.getCustomerPhone(), phone)) {
			throw ApiException.notFound("Order"); // same as missing, so order numbers can't be probed
		}
		return order;
	}
}
