package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.discount.DiscountService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CheckoutService {

	private static final ZoneId ADDIS_ABABA = ZoneId.of("Africa/Addis_Ababa");
	private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

	private final ProductRepository products;
	private final OrderRepository orders;
	private final OrderService orderService;
	private final et.tenapay.shop.config.AppProperties app;
	private final et.tenapay.shop.events.OrderEventPublisher publisher;
	private final DiscountService discounts;
	private final et.tenapay.shop.payment.billpay.BillPayMode billPayMode;
	private final OrderParcelRepository parcels;

	public record Line(Long productId, int quantity) {
	}

	public record CustomerInfo(String name, String phone, String email) {
	}

	/** {@code area}: area of Sodo from Admin → Areas (optional); an area with its own fee sets the delivery fee. */
	public record DeliveryInfo(String address, String city, String notes, String area) {

		public DeliveryInfo(String address, String city, String notes) {
			this(address, city, notes, null);
		}
	}

	private et.tenapay.shop.catalog.AreaRepository areas;

	@org.springframework.beans.factory.annotation.Autowired
	void setAreas(et.tenapay.shop.catalog.AreaRepository areas) {
		this.areas = areas;
	}

	/** The listed, active area with this name (any case), if there is one. */
	java.util.Optional<et.tenapay.shop.catalog.Area> area(String name) {
		if (name == null || name.isBlank() || areas == null) {
			return java.util.Optional.empty();
		}
		return areas.findAllByOrderBySortOrderAscIdAsc().stream()
				.filter(a -> a.isActive() && a.getName().equalsIgnoreCase(name.trim())).findFirst();
	}

	/** The area's own delivery fee, or null for the standard fee. */
	private BigDecimal areaFee(String name) {
		return area(name).map(et.tenapay.shop.catalog.Area::getDeliveryFee).orElse(null);
	}

	/**
	 * Creates the order with server-side prices and the delivery fee, and reserves stock. Does not call BillPay.
	 */
	@Transactional
	public Order createOrder(List<Line> lines, CustomerInfo customer, DeliveryInfo delivery, UUID userId,
			String discountCode) {
		Map<Long, Integer> qtyByProduct = new LinkedHashMap<>();
		for (Line line : lines) {
			qtyByProduct.merge(line.productId(), line.quantity(), Integer::sum);
		}
		// Read without locking; stock is reserved at the very end with one conditional update per product, so the
		// product rows are locked only for the last moments of the transaction (see ProductRepository).
		Map<Long, Product> byId = new LinkedHashMap<>();
		products.findAllById(qtyByProduct.keySet()).forEach(p -> byId.put(p.getId(), p));

		List<Map<String, Object>> problems = new ArrayList<>();
		qtyByProduct.forEach((id, qty) -> {
			Product p = byId.get(id);
			if (p == null || !p.sellable()) {
				problems.add(Map.of("productId", id, "problem", "UNAVAILABLE"));
			} else if (p.available() < qty) {
				problems.add(Map.of("productId", id, "problem", "INSUFFICIENT_STOCK", "available", p.available()));
			}
		});
		if (!problems.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "CART_INVALID", "Some items in your cart are unavailable.",
					Map.of("items", problems));
		}

		Order order = new Order();
		order.setOrderNumber(nextOrderNumber());
		order.setStatus(OrderStatus.PENDING_PAYMENT);
		order.setCurrency("ETB");
		order.setEnvironment(billPayMode.current());
		order.setCustomerName(customer.name().trim());
		order.setCustomerPhone(normalizePhone(customer.phone()));
		order.setCustomerEmail(customer.email().trim().toLowerCase());
		order.setUserId(userId);

		// One parcel per seller (Sodo Gebeya's own items first): each seller packs and delivers their own parcel.
		List<Parcel> parcelPlan = plan(qtyByProduct, byId);
		BigDecimal subtotal = BigDecimal.ZERO.setScale(2);
		for (Parcel parcel : parcelPlan) {
			for (Map.Entry<Product, Integer> e : parcel.lines()) {
				Product p = e.getKey();
				int qty = e.getValue();
				OrderItem item = new OrderItem();
				item.setProductId(p.getId());
				item.setShopId(parcel.shopId());
				item.setParcelNo(parcel.no());
				item.setProductName(p.getName());
				item.setUnitPrice(p.getPrice());
				item.setQuantity(qty);
				item.setLineTotal(p.getPrice().multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP));
				order.addItem(item);
			}
			subtotal = subtotal.add(parcel.itemsTotal());
		}
		// Discount comes off the items (spread over the parcels by value); each parcel's delivery fee is worked out
		// on what's left of it.
		BigDecimal discount = BigDecimal.ZERO.setScale(2);
		if (discountCode != null && !discountCode.isBlank()) {
			DiscountService.Applied applied = discounts.use(discountCode, subtotal);
			discount = applied.amount();
			order.setDiscountCode(applied.code());
		}
		List<Priced> priced = price(parcelPlan, discount, areaFee(delivery.area()));
		BigDecimal items = subtotal.subtract(discount);
		BigDecimal fee = priced.stream().map(Priced::deliveryFee).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
		BigDecimal total = items.add(fee);
		if (total.compareTo(BigDecimal.ONE) < 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "DISCOUNT_INVALID",
					"This discount would make the order free; BillPay needs at least ETB 1.00 to charge.",
					Map.of("reason", "TOTAL_TOO_LOW"));
		}
		order.setSubtotal(subtotal);
		order.setDiscountAmount(discount);
		order.setDeliveryFee(fee);
		order.setTotal(total);
		order.setDeliveryAddress(delivery.address().trim());
		order.setDeliveryCity(delivery.city().trim());
		order.setDeliveryArea(delivery.area() == null || delivery.area().isBlank() ? null
				: area(delivery.area()).map(et.tenapay.shop.catalog.Area::getName).orElse(delivery.area().trim()));
		order.setDeliveryNotes(delivery.notes() == null || delivery.notes().isBlank() ? null : delivery.notes().trim());
		order.setCreatedAt(Instant.now());
		orders.save(order);
		for (Priced pr : priced) {
			OrderParcel parcel = new OrderParcel();
			parcel.setOrderId(order.getId());
			parcel.setParcelNo(pr.parcel().no());
			parcel.setShopId(pr.parcel().shopId());
			parcel.setItemsTotal(pr.parcel().itemsTotal());
			parcel.setDiscountShare(pr.discountShare());
			parcel.setDeliveryFee(pr.deliveryFee());
			parcels.save(parcel);
		}
		orderService.note(order, "ORDER_CREATED", qtyByProduct.size() + " product(s)"
				+ (priced.size() > 1 ? " from " + priced.size() + " sellers" : "") + ", subtotal " + subtotal
				+ (discount.signum() > 0 ? " - " + discount + " (" + order.getDiscountCode() + ")" : "")
				+ " + delivery " + fee + " = " + order.getTotal() + " ETB");
		publisher.publish(order, "order.placed", Map.of());

		// Last step: reserve the stock. Ascending ids so two checkouts never wait on each other in a circle.
		// Someone may have bought the last units since we read them; then nothing is kept (the whole order rolls back).
		List<Map<String, Object>> soldOut = new ArrayList<>();
		for (Long id : new java.util.TreeSet<>(qtyByProduct.keySet())) {
			if (products.reserveIfAvailable(id, qtyByProduct.get(id)) == 0) {
				soldOut.add(Map.of("productId", id, "problem", "INSUFFICIENT_STOCK"));
			}
		}
		if (!soldOut.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "CART_INVALID", "Some items in your cart just sold out.",
					Map.of("items", soldOut));
		}
		return order;
	}

	/** One seller's part of a quote; {@code seller} null = Sodo Gebeya. */
	public record ParcelQuote(String seller, String sellerSlug, BigDecimal itemsTotal, BigDecimal deliveryFee) {
	}

	public record Quote(BigDecimal subtotal, String discountCode, String discountDescription, BigDecimal discount,
			BigDecimal deliveryFee, BigDecimal total, List<ParcelQuote> parcels) {
	}

	/** What the cart would cost (with this code, if any), using server prices. Nothing is reserved or used. */
	@Transactional(readOnly = true)
	public Quote quote(List<Line> lines, String discountCode) {
		return quote(lines, discountCode, null);
	}

	/** Same, with the delivery fee for this area of Sodo. */
	@Transactional(readOnly = true)
	public Quote quote(List<Line> lines, String discountCode, String area) {
		Map<Long, Integer> qtyByProduct = new LinkedHashMap<>();
		for (Line line : lines) {
			qtyByProduct.merge(line.productId(), line.quantity(), Integer::sum);
		}
		Map<Long, Product> byId = new LinkedHashMap<>();
		products.findAllById(qtyByProduct.keySet()).stream().filter(Product::sellable).forEach(p -> byId.put(p.getId(), p));
		qtyByProduct.keySet().retainAll(byId.keySet());
		List<Parcel> plan = plan(qtyByProduct, byId);
		BigDecimal subtotal = plan.stream().map(Parcel::itemsTotal).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
		DiscountService.Applied applied = discountCode == null || discountCode.isBlank()
				? new DiscountService.Applied(null, null, BigDecimal.ZERO.setScale(2))
				: discounts.quote(discountCode, subtotal);
		List<Priced> priced = price(plan, applied.amount(), areaFee(area));
		BigDecimal fee = priced.stream().map(Priced::deliveryFee).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
		List<ParcelQuote> parcelQuotes = priced.stream().map(p -> new ParcelQuote(p.parcel().sellerName(),
				p.parcel().sellerSlug(), p.parcel().itemsTotal(), p.deliveryFee())).toList();
		return new Quote(subtotal, applied.code(), applied.description(), applied.amount(), fee,
				subtotal.subtract(applied.amount()).add(fee), parcelQuotes);
	}

	/** A seller's lines in a cart; {@code shopId} null = Sodo Gebeya. */
	record Parcel(int no, Long shopId, String sellerName, String sellerSlug, List<Map.Entry<Product, Integer>> lines,
			BigDecimal itemsTotal) {
	}

	record Priced(Parcel parcel, BigDecimal discountShare, BigDecimal deliveryFee) {
	}

	/** Groups the cart by seller: Sodo Gebeya's own items first, then each shop in the order its items were added. */
	static List<Parcel> plan(Map<Long, Integer> qtyByProduct, Map<Long, Product> byId) {
		Map<Long, List<Map.Entry<Product, Integer>>> bySeller = new LinkedHashMap<>();
		bySeller.put(null, new ArrayList<>());
		qtyByProduct.forEach((id, qty) -> {
			Product p = byId.get(id);
			Long shopId = p.getShop() == null ? null : p.getShop().getId();
			bySeller.computeIfAbsent(shopId, k -> new ArrayList<>()).add(Map.entry(p, qty));
		});
		List<Parcel> out = new ArrayList<>();
		for (Map.Entry<Long, List<Map.Entry<Product, Integer>>> e : bySeller.entrySet()) {
			if (e.getValue().isEmpty()) {
				continue;
			}
			BigDecimal total = e.getValue().stream()
					.map(l -> l.getKey().getPrice().multiply(BigDecimal.valueOf(l.getValue())).setScale(2, RoundingMode.HALF_UP))
					.reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
			var shop = e.getValue().get(0).getKey().getShop();
			out.add(new Parcel(out.size() + 1, e.getKey(), shop == null ? null : shop.getName(),
					shop == null ? null : shop.getSlug(), e.getValue(), total));
		}
		return out;
	}

	/** Spreads the discount over the parcels by value (the last takes the rounding rest) and prices each delivery. */
	List<Priced> price(List<Parcel> plan, BigDecimal discount) {
		return price(plan, discount, null);
	}

	/** {@code areaFee} null = the standard fee; otherwise each parcel pays it, unless it reaches the free-delivery amount. */
	List<Priced> price(List<Parcel> plan, BigDecimal discount, BigDecimal areaFee) {
		BigDecimal subtotal = plan.stream().map(Parcel::itemsTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
		List<Priced> out = new ArrayList<>();
		BigDecimal left = discount;
		for (int i = 0; i < plan.size(); i++) {
			Parcel p = plan.get(i);
			BigDecimal share = i == plan.size() - 1 || subtotal.signum() == 0 ? left
					: discount.multiply(p.itemsTotal()).divide(subtotal, 2, RoundingMode.HALF_UP).min(left);
			left = left.subtract(share);
			out.add(new Priced(p, share, fee(p.itemsTotal().subtract(share), areaFee)));
		}
		return out;
	}

	private BigDecimal fee(BigDecimal items, BigDecimal areaFee) {
		if (areaFee == null) {
			return app.delivery().feeFor(items);
		}
		BigDecimal freeOver = app.delivery() == null ? null : app.delivery().freeOver();
		return freeOver != null && freeOver.signum() > 0 && items.compareTo(freeOver) >= 0 ? BigDecimal.ZERO.setScale(2)
				: areaFee.setScale(2, RoundingMode.HALF_UP);
	}

	private String nextOrderNumber() {
		return "TS-" + LocalDate.now(ADDIS_ABABA).format(DAY) + "-" + String.format("%05d", orders.nextOrderSequence());
	}

	/** Stores Ethiopian numbers as +2519XXXXXXXX / +2517XXXXXXXX where possible. */
	public static String normalizePhone(String phone) {
		String digits = phone.replaceAll("[^0-9]", "");
		if (digits.startsWith("251") && digits.length() == 12) {
			return "+" + digits;
		}
		if (digits.startsWith("0") && digits.length() == 10) {
			return "+251" + digits.substring(1);
		}
		if (digits.length() == 9) {
			return "+251" + digits;
		}
		return phone.trim();
	}

	public static boolean samePhone(String a, String b) {
		String da = a == null ? "" : a.replaceAll("[^0-9]", "");
		String db = b == null ? "" : b.replaceAll("[^0-9]", "");
		if (da.length() < 9 || db.length() < 9) {
			return false;
		}
		return da.substring(da.length() - 9).equals(db.substring(db.length() - 9));
	}
}
