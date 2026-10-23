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

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CheckoutService {

	private static final ZoneId ADDIS_ABABA = ZoneId.of("Africa/Addis_Ababa");
	private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

	private final ProductRepository products;
	private final OrderRepository orders;
	private final OrderService orderService;

	public record Line(Long productId, int quantity) {
	}

	public record CustomerInfo(String name, String phone, String email) {
	}

	/** Creates the order with server-side prices and reserves stock. Does not call BillPay. */
	@Transactional
	public Order createOrder(List<Line> lines, CustomerInfo customer) {
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
		order.setSubtotal(subtotal);
		order.setTotal(subtotal);
		order.setCreatedAt(Instant.now());
		orders.save(order);
		orderService.note(order, "ORDER_CREATED", qtyByProduct.size() + " product(s), total " + subtotal + " ETB");
		return order;
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
