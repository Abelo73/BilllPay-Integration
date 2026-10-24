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

	public record Line(Long productId, int quantity) {
	}

	public record CustomerInfo(String name, String phone, String email) {
	}

	public record DeliveryInfo(String address, String city, String notes) {
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
		Map<Long, Product> byId = new LinkedHashMap<>();
		products.lockAllById(qtyByProduct.keySet()).forEach(p -> byId.put(p.getId(), p));

		List<Map<String, Object>> problems = new ArrayList<>();
		qtyByProduct.forEach((id, qty) -> {
			Product p = byId.get(id);
			if (p == null || !p.isActive()) {
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
		order.setCustomerName(customer.name().trim());
		order.setCustomerPhone(normalizePhone(customer.phone()));
		order.setCustomerEmail(customer.email().trim().toLowerCase());
		order.setUserId(userId);

		BigDecimal subtotal = BigDecimal.ZERO;
		for (Map.Entry<Long, Integer> e : qtyByProduct.entrySet()) {
			Product p = byId.get(e.getKey());
			int qty = e.getValue();
			p.reserve(qty);
			OrderItem item = new OrderItem();
			item.setProductId(p.getId());
			item.setProductName(p.getName());
			item.setUnitPrice(p.getPrice());
			item.setQuantity(qty);
			item.setLineTotal(p.getPrice().multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP));
			order.addItem(item);
			subtotal = subtotal.add(item.getLineTotal());
		}
		// Discount comes off the items; the delivery fee is worked out on what's left.
		BigDecimal discount = BigDecimal.ZERO.setScale(2);
		if (discountCode != null && !discountCode.isBlank()) {
			DiscountService.Applied applied = discounts.use(discountCode, subtotal);
			discount = applied.amount();
			order.setDiscountCode(applied.code());
		}
		BigDecimal items = subtotal.subtract(discount);
		BigDecimal fee = app.delivery().feeFor(items);
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
		order.setDeliveryNotes(delivery.notes() == null || delivery.notes().isBlank() ? null : delivery.notes().trim());
		order.setCreatedAt(Instant.now());
		orders.save(order);
		orderService.note(order, "ORDER_CREATED", qtyByProduct.size() + " product(s), subtotal " + subtotal
				+ (discount.signum() > 0 ? " - " + discount + " (" + order.getDiscountCode() + ")" : "")
				+ " + delivery " + fee + " = " + order.getTotal() + " ETB");
		publisher.publish(order, "order.placed", Map.of());
		return order;
	}

	public record Quote(BigDecimal subtotal, String discountCode, String discountDescription, BigDecimal discount,
			BigDecimal deliveryFee, BigDecimal total) {
	}

	/** What the cart would cost with this code, using server prices. Nothing is reserved or used. */
	@Transactional(readOnly = true)
	public Quote quote(List<Line> lines, String discountCode) {
		Map<Long, Integer> qtyByProduct = new LinkedHashMap<>();
		for (Line line : lines) {
			qtyByProduct.merge(line.productId(), line.quantity(), Integer::sum);
		}
		BigDecimal subtotal = BigDecimal.ZERO.setScale(2);
		for (Product p : products.findAllById(qtyByProduct.keySet())) {
			if (p.isActive()) {
				subtotal = subtotal.add(p.getPrice().multiply(BigDecimal.valueOf(qtyByProduct.get(p.getId()))));
			}
		}
		DiscountService.Applied applied = discounts.quote(discountCode, subtotal);
		BigDecimal items = subtotal.subtract(applied.amount());
		BigDecimal fee = app.delivery().feeFor(items);
		return new Quote(subtotal, applied.code(), applied.description(), applied.amount(), fee, items.add(fee));
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
