package et.tenapay.shop.seller;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.admin.CatalogAdminController.ChangeRow;
import et.tenapay.shop.admin.CatalogAdminController.ProductDetail;
import et.tenapay.shop.admin.CatalogAdminController.ProductRow;
import et.tenapay.shop.catalog.CatalogAdminService;
import et.tenapay.shop.catalog.CatalogAdminService.ProductForm;
import et.tenapay.shop.catalog.CatalogChange;
import et.tenapay.shop.catalog.CatalogChangeRepository;
import et.tenapay.shop.catalog.Category;
import et.tenapay.shop.catalog.CategoryRepository;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductImageRepository;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.order.FulfilmentService;
import et.tenapay.shop.order.FulfilmentStatus;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderItem;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.seller.ShopViews.ShopDto;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Everything a seller does: their shop, their products, their orders. Each request resolves the signed-in customer's
 * own shop first ({@link ShopService#requireMine()}); a product or order of another shop answers 404, exactly like one
 * that doesn't exist.
 */
@RestController
@RequestMapping("/api/seller")
@RequiredArgsConstructor
public class SellerController {

	private static final ZoneId ADDIS_ABABA = ZoneId.of("Africa/Addis_Ababa");
	private static final Set<FulfilmentStatus> TO_SEND = EnumSet.of(FulfilmentStatus.UNFULFILLED, FulfilmentStatus.PROCESSING);

	private final ShopService shopService;
	private final CatalogAdminService catalog;
	private final ProductRepository products;
	private final CategoryRepository categories;
	private final ProductImageRepository images;
	private final CatalogChangeRepository changes;
	private final OrderRepository orders;
	private final FulfilmentService fulfilment;
	private final et.tenapay.shop.order.OrderParcelRepository parcels;
	private final BillPayMode billPayMode;
	private final org.springframework.jdbc.core.JdbcTemplate jdbc;
	private final MediaProperties media;

	public record ShopRequest(ShopKind kind, @NotBlank @Size(min = 2, max = 120) String name,
			@Size(max = 2000) String description, @NotBlank @Size(max = 20) String phone, @Size(max = 120) String area,
			@Size(max = 200) String addressLine) {

		ShopService.ShopForm form() {
			return new ShopService.ShopForm(kind, name, description, phone, area, addressLine);
		}
	}

	public record ProductRequest(
			@NotBlank @Size(max = 200) String name,
			@Size(max = 5000) String description,
			@NotNull Long categoryId,
			@NotNull @DecimalMin("0.01") @DecimalMax("10000000") @Digits(integer = 10, fraction = 2) BigDecimal price,
			@Min(0) @Max(100000) Integer stock,
			@Min(0) @Max(100000) Integer lowStockThreshold,
			Boolean active,
			et.tenapay.shop.catalog.ItemCondition condition,
			Boolean negotiable,
			@Size(max = 120) String area) {
	}

	public record StockRequest(@NotNull @Min(-100000) @Max(100000) Integer delta, @Size(max = 200) String reason) {
	}

	public record VisibilityRequest(@NotNull Boolean active) {
	}

	public record ImageOrderRequest(@NotNull List<Long> ids) {
	}

	public record FulfilmentRequest(@NotNull FulfilmentStatus status, @Size(max = 300) String note) {
	}

	public record CategoryDto(Long id, String name, String slug) {
	}

	public record BestSeller(String productName, long units) {
	}

	public record Summary(ShopDto shop, long products, long inStore, long lowStock, long soldOut, long toSend,
			long onTheWay, BigDecimal salesToday, long ordersToday, BigDecimal salesThisMonth, long ordersThisMonth,
			long unitsThisMonth, List<BestSeller> bestSellers, List<OrderRow> toSendNow,
			/** Buyers who revealed the shop's phone in the last 30 days (Jiji-style buying). */
			long contacts30d) {
	}

	public record OrderLine(Long productId, String productName, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {
	}

	/**
	 * The seller's parcel of a paid order: only their own lines, their share and their delivery steps.
	 * {@code otherSellers} = the buyer also bought from other sellers in the same checkout (they deliver their own).
	 */
	public record OrderRow(String orderNumber, String parcelNumber, String status, String fulfilmentStatus,
			Instant paidAt, String customerName, String deliveryCity, int units, BigDecimal itemsTotal,
			BigDecimal deliveryFee, boolean otherSellers, List<String> nextSteps) {
	}

	public record OrderDetail(OrderRow order, String customerPhone, String deliveryAddress, String deliveryNotes,
			String trackingNote, Instant shippedAt, Instant deliveredAt, List<OrderLine> items) {
	}

	// ---------- shop ----------

	@GetMapping("/shop")
	@Transactional(readOnly = true)
	public ShopDto myShop() {
		return ShopDto.of(shopService.requireMine(), media);
	}

	@PostMapping("/shop")
	public ShopDto open(@Valid @RequestBody ShopRequest req) {
		CurrentUser me = CurrentUser.require();
		if (me.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "NOT_A_SELLER", "Staff accounts can't sell. Use a customer account.");
		}
		return ShopDto.of(shopService.open(me.id(), req.form()), media);
	}

	@PutMapping("/shop")
	public ShopDto update(@Valid @RequestBody ShopRequest req) {
		return ShopDto.of(shopService.update(shopService.requireMine().getId(), req.form()), media);
	}

	@PostMapping(path = "/shop/{kind:logo|cover}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ShopDto image(@PathVariable String kind, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo to upload.");
		}
		Shop shop = shopService.requireMine();
		return ShopDto.of(shopService.setImage(shop.getId(), ShopService.ImageKind.valueOf(kind.toUpperCase()),
				file.getBytes()), media);
	}

	// ---------- dashboard ----------

	@GetMapping("/summary")
	@Transactional(readOnly = true)
	public Summary summary() {
		Shop shop = shopService.requireMine();
		var env = billPayMode.current();
		Object[] c = products.shopCounts(shop.getId()).get(0);
		LocalDate today = LocalDate.now(ADDIS_ABABA);
		Instant dayStart = today.atStartOfDay(ADDIS_ABABA).toInstant();
		Instant monthStart = today.withDayOfMonth(1).atStartOfDay(ADDIS_ABABA).toInstant();
		Object[] day = orders.shopSales(shop.getId(), dayStart, env).get(0);
		Object[] month = orders.shopSales(shop.getId(), monthStart, env).get(0);
		List<BestSeller> best = orders.shopBestSellers(shop.getId(), monthStart, env, PageRequest.of(0, 5)).stream()
				.map(r -> new BestSeller((String) r[0], ((Number) r[1]).longValue())).toList();
		List<OrderRow> toSendNow = rows(parcels.findForShop(shop.getId(), env, TO_SEND, null,
				PageRequest.of(0, 5, Sort.by("id").ascending())).getContent());
		return new Summary(ShopDto.of(shop, media), n(c[0]), n(c[1]), n(c[2]), n(c[3]),
				parcels.countForShop(shop.getId(), env, TO_SEND),
				parcels.countForShop(shop.getId(), env, EnumSet.of(FulfilmentStatus.SHIPPED)),
				(BigDecimal) day[0], n(day[1]), (BigDecimal) month[0], n(month[1]), n(month[2]), best, toSendNow,
				n(jdbc.queryForObject("select count(*) from contact_reveals where shop_id = ? and created_at > now() - interval '30 days'",
						Long.class, shop.getId())));
	}

	// ---------- products ----------

	@GetMapping("/categories")
	@Transactional(readOnly = true)
	public List<CategoryDto> categories() {
		return categories.findByActiveTrueOrderBySortOrderAscIdAsc().stream()
				.map(c -> new CategoryDto(c.getId(), c.getName(), c.getSlug())).toList();
	}

	@GetMapping("/products")
	@Transactional(readOnly = true)
	public PageDto<ProductRow> products(@RequestParam(required = false) String q,
			@RequestParam(required = false) String status, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		Shop shop = shopService.requireMine();
		String query = q == null || q.isBlank() ? null : q.trim();
		String st = status == null || status.isBlank() || "all".equals(status) ? null : status;
		return PageDto.of(products.adminSearch(query, null, st, shop.getId(), false,
				PageRequest.of(page, Math.min(size, 100), Sort.by("id").descending())).map(ProductRow::of));
	}

	@GetMapping("/products/{id}")
	@Transactional(readOnly = true)
	public ProductDetail product(@PathVariable Long id) {
		return detail(own(shopService.requireMine(), id));
	}

	@PostMapping("/products")
	public ProductDetail create(@Valid @RequestBody ProductRequest req) {
		Shop shop = shopService.requireMine();
		activeCategory(req.categoryId());
		Product p = catalog.create(new ProductForm(req.name(), null, req.description(), req.categoryId(), req.price(),
				req.stock(), req.lowStockThreshold(), false, req.active(), req.condition(), req.negotiable(), req.area()), shop);
		return detailOf(p.getId());
	}

	@PutMapping("/products/{id}")
	public ProductDetail update(@PathVariable Long id, @Valid @RequestBody ProductRequest req) {
		Product p = own(shopService.requireMine(), id);
		if (!req.categoryId().equals(p.getCategory().getId())) {
			activeCategory(req.categoryId());
		}
		// sellers can't feature their own products on the home page or change the address of a listing
		catalog.update(id, new ProductForm(req.name(), null, req.description(), req.categoryId(), req.price(), null,
				req.lowStockThreshold(), null, req.active(), req.condition(), req.negotiable(), req.area() == null ? "" : req.area()));
		return detailOf(id);
	}

	@PatchMapping("/products/{id}/visibility")
	public ProductDetail visibility(@PathVariable Long id, @Valid @RequestBody VisibilityRequest req) {
		Product p = own(shopService.requireMine(), id);
		if (req.active() && p.getBlockedReason() != null) {
			throw new ApiException(HttpStatus.CONFLICT, "LISTING_BLOCKED",
					"Sodo Gebeya took this listing down: " + p.getBlockedReason() + ". Edit it and call us to put it back.");
		}
		catalog.setActive(id, req.active());
		return detailOf(id);
	}

	@PostMapping("/products/{id}/stock")
	public ProductDetail stock(@PathVariable Long id, @Valid @RequestBody StockRequest req) {
		own(shopService.requireMine(), id);
		catalog.adjustStock(id, req.delta(), req.reason());
		return detailOf(id);
	}

	@PostMapping("/products/{id}/duplicate")
	public ProductDetail duplicate(@PathVariable Long id) {
		own(shopService.requireMine(), id);
		return detailOf(catalog.duplicate(id).getId());
	}

	@GetMapping("/products/{id}/changes")
	@Transactional(readOnly = true)
	public PageDto<ChangeRow> changes(@PathVariable Long id, @RequestParam(defaultValue = "0") int page) {
		own(shopService.requireMine(), id);
		return PageDto.of(changes.findByEntityTypeAndEntityId(CatalogChange.EntityType.PRODUCT, id,
				PageRequest.of(page, 20, Sort.by("createdAt").descending())).map(ChangeRow::of));
	}

	@PostMapping(path = "/products/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProductDetail upload(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		own(shopService.requireMine(), id);
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo to upload.");
		}
		catalog.addImage(id, file.getBytes());
		return detailOf(id);
	}

	@DeleteMapping("/products/{id}/images/{imageId}")
	public ProductDetail removeImage(@PathVariable Long id, @PathVariable Long imageId) {
		own(shopService.requireMine(), id);
		catalog.removeImage(id, imageId);
		return detailOf(id);
	}

	@PutMapping("/products/{id}/images/order")
	public ProductDetail reorderImages(@PathVariable Long id, @Valid @RequestBody ImageOrderRequest req) {
		own(shopService.requireMine(), id);
		catalog.reorderImages(id, req.ids());
		return detailOf(id);
	}

	// ---------- orders ----------

	/** tab: send (paid, not shipped yet), way (on the way), done (delivered or cancelled), all. */
	@GetMapping("/orders")
	@Transactional(readOnly = true)
	public PageDto<OrderRow> orders(@RequestParam(defaultValue = "send") String tab,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page) {
		Shop shop = shopService.requireMine();
		Set<FulfilmentStatus> f = switch (tab) {
			case "way" -> EnumSet.of(FulfilmentStatus.SHIPPED);
			case "done" -> EnumSet.of(FulfilmentStatus.DELIVERED, FulfilmentStatus.CANCELLED);
			case "all" -> EnumSet.allOf(FulfilmentStatus.class);
			default -> TO_SEND;
		};
		// oldest first while there's something to send, newest first otherwise
		Sort sort = "send".equals(tab) ? Sort.by("id").ascending() : Sort.by("id").descending();
		var result = parcels.findForShop(shop.getId(), billPayMode.current(), f, q == null || q.isBlank() ? null : q.trim(),
				PageRequest.of(page, 20, sort));
		return PageDto.of(new org.springframework.data.domain.PageImpl<>(rows(result.getContent()), result.getPageable(),
				result.getTotalElements()));
	}

	@GetMapping("/orders/{orderNumber}")
	@Transactional(readOnly = true)
	public OrderDetail order(@PathVariable String orderNumber) {
		Shop shop = shopService.requireMine();
		Order o = ownOrder(orderNumber);
		return detail(o, ownParcel(shop, o));
	}

	/** Packing → on the way → delivered, for this seller's parcel of the order. */
	@PostMapping("/orders/{orderNumber}/fulfilment")
	public OrderDetail advance(@PathVariable String orderNumber, @Valid @RequestBody FulfilmentRequest req) {
		Shop shop = shopService.requireMine();
		OrderParcel parcel = ownParcel(shop, ownOrder(orderNumber));
		fulfilment.advanceParcel(orderNumber, parcel.getParcelNo(), req.status(), req.note(), "seller " + shop.getName(),
				shop.getId());
		Order o = ownOrder(orderNumber);
		return detail(o, ownParcel(shop, o));
	}

	// ---------- helpers ----------

	private Product own(Shop shop, Long id) {
		return products.findWithCategoryById(id)
				.filter(p -> p.getShop() != null && p.getShop().getId().equals(shop.getId()))
				.orElseThrow(() -> ApiException.notFound("Product"));
	}

	/** A paid order (current BillPay environment); 404 otherwise. Pair it with {@link #ownParcel}. */
	private Order ownOrder(String orderNumber) {
		return orders.findByOrderNumber(orderNumber)
				.filter(o -> o.getPaidAt() != null && o.getEnvironment() == billPayMode.current())
				.orElseThrow(() -> ApiException.notFound("Order"));
	}

	/** This seller's parcel of the order; an order without one answers 404, like a missing order. */
	private OrderParcel ownParcel(Shop shop, Order o) {
		return parcels.findByOrderIdAndShopId(o.getId(), shop.getId()).orElseThrow(() -> ApiException.notFound("Order"));
	}

	private void activeCategory(Long id) {
		categories.findById(id).filter(Category::isActive)
				.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "CATEGORY_UNAVAILABLE", "Choose one of the listed categories."));
	}

	private ProductDetail detailOf(Long id) {
		return detail(products.findWithCategoryById(id).orElseThrow());
	}

	private ProductDetail detail(Product p) {
		return ProductDetail.of(p, images.findByProductIdOrderByPositionAsc(p.getId()), media);
	}

	/** Rows for parcels, loading their orders in one go. */
	private List<OrderRow> rows(List<OrderParcel> list) {
		Map<java.util.UUID, Order> byId = new java.util.HashMap<>();
		orders.findAllById(list.stream().map(OrderParcel::getOrderId).toList()).forEach(o -> byId.put(o.getId(), o));
		return list.stream().map(p -> row(byId.get(p.getOrderId()), p)).toList();
	}

	private OrderRow row(Order o, OrderParcel p) {
		List<OrderItem> mine = mine(o, p);
		boolean others = parcels.findByOrderIdOrderByParcelNoAsc(o.getId()).size() > 1;
		List<String> next = p.getFulfilmentStatus() == null ? List.of()
				: p.getFulfilmentStatus().next().stream().filter(st -> st != FulfilmentStatus.CANCELLED).sorted()
						.map(Enum::name).toList();
		return new OrderRow(o.getOrderNumber(), p.number(o.getOrderNumber()), o.getStatus().name(),
				p.getFulfilmentStatus() == null ? null : p.getFulfilmentStatus().name(), o.getPaidAt(),
				firstName(o.getCustomerName()), o.getDeliveryCity(), mine.stream().mapToInt(OrderItem::getQuantity).sum(),
				p.getItemsTotal(), p.getDeliveryFee(), others, next);
	}

	/** The seller delivers their own parcel, so they get the buyer's full name, phone and address. */
	private OrderDetail detail(Order o, OrderParcel p) {
		List<OrderLine> lines = mine(o, p).stream()
				.map(i -> new OrderLine(i.getProductId(), i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
				.toList();
		OrderRow r = row(o, p);
		return new OrderDetail(new OrderRow(r.orderNumber(), r.parcelNumber(), r.status(), r.fulfilmentStatus(), r.paidAt(),
				o.getCustomerName(), r.deliveryCity(), r.units(), r.itemsTotal(), r.deliveryFee(), r.otherSellers(), r.nextSteps()),
				o.getCustomerPhone(), o.getDeliveryAddress(), o.getDeliveryNotes(), p.getTrackingNote(), p.getShippedAt(),
				p.getDeliveredAt(), lines);
	}

	private static List<OrderItem> mine(Order o, OrderParcel p) {
		return o.getItems().stream().filter(i -> i.getParcelNo() != null ? i.getParcelNo() == p.getParcelNo()
				: java.util.Objects.equals(i.getShopId(), p.getShopId())).toList();
	}

	/** "Hana Girma" → "Hana G." in lists. */
	static String firstName(String full) {
		if (full == null || full.isBlank()) {
			return "";
		}
		String[] parts = full.trim().split("\\s+");
		return parts.length == 1 ? parts[0] : parts[0] + " " + parts[1].charAt(0) + ".";
	}

	private static long n(Object o) {
		return o == null ? 0 : ((Number) o).longValue();
	}
}
