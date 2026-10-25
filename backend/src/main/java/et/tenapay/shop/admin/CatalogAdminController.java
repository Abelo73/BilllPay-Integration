package et.tenapay.shop.admin;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

import et.tenapay.shop.catalog.CatalogAdminService;
import et.tenapay.shop.catalog.CatalogAdminService.ProductForm;
import et.tenapay.shop.catalog.CatalogChange;
import et.tenapay.shop.catalog.CatalogChangeRepository;
import et.tenapay.shop.catalog.CategoryRepository;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductImage;
import et.tenapay.shop.catalog.ProductImageRepository;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
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

/** Products, photos and categories for the admin. GET is open to Support; changes need ADMIN (SecurityConfig). */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class CatalogAdminController {

	private final CatalogAdminService catalog;
	private final ProductRepository products;
	private final CategoryRepository categories;
	private final ProductImageRepository images;
	private final CatalogChangeRepository changes;
	private final et.tenapay.shop.catalog.CategoryFieldRepository fields;
	private final MediaProperties media;

	public record ProductRequest(
			@NotBlank @Size(max = 200) String name,
			@Size(max = 200) String slug,
			@Size(max = 5000) String description,
			@NotNull Long categoryId,
			@NotNull @DecimalMin("0.01") @DecimalMax("10000000") @Digits(integer = 10, fraction = 2) BigDecimal price,
			@Min(0) @Max(1000000) Integer stock,
			@Min(0) @Max(100000) Integer lowStockThreshold,
			Boolean featured,
			Boolean active,
			et.tenapay.shop.catalog.ItemCondition condition,
			Boolean negotiable,
			@Size(max = 120) String area,
			@Size(max = 40) java.util.Map<String, Object> specs) {

		ProductForm form() {
			return new ProductForm(name, slug, description, categoryId, price, stock, lowStockThreshold, featured, active,
					condition, negotiable, area, specs);
		}
	}

	public record StockRequest(@NotNull @Min(-1000000) @Max(1000000) Integer delta, @Size(max = 200) String reason) {
	}

	public record VisibilityRequest(@NotNull Boolean active) {
	}

	public record OrderRequest(@NotNull List<Long> ids) {
	}

	/** {@code parentId}: put it under a main category; {@code mainCategory=true}: make it a main category again. */
	public record CategoryRequest(@Size(max = 100) String name, Boolean active, Long parentId, Boolean mainCategory) {
	}

	public record ImageView(Long id, int position, String url, String thumbUrl, Integer width, Integer height,
			Integer sizeBytes) {

		static ImageView of(ProductImage i, MediaProperties media) {
			return new ImageView(i.getId(), i.getPosition(), media.urlFor(i.getLargeKey()),
					media.urlFor(i.getThumbKey()), i.getWidth(), i.getHeight(), i.getSizeBytes());
		}
	}

	/** {@code shopId}/{@code shopName} null = sold by Sodo Gebeya; {@code inStore} = actually visible to shoppers. */
	public record ProductRow(Long id, String name, String slug, String categoryName, Long categoryId,
			BigDecimal price, int stock, int reserved, int available, int lowStockThreshold, boolean lowStock,
			boolean featured, boolean active, String imageUrl, Instant updatedAt, Long shopId, String shopName,
			String shopStatus, boolean inStore, String condition, boolean negotiable, String area, String blockedReason) {

		public static ProductRow of(Product p) {
			var shop = p.getShop();
			return new ProductRow(p.getId(), p.getName(), p.getSlug(), p.getCategory().getName(),
					p.getCategory().getId(), p.getPrice(), p.getStock(), p.getReserved(), p.available(),
					p.getLowStockThreshold(), p.lowStock(), p.isFeatured(), p.isActive(), p.getImageUrl(),
					p.getUpdatedAt(), shop == null ? null : shop.getId(), shop == null ? null : shop.getName(),
					shop == null ? null : shop.getStatus().name(), p.sellable() && p.getCategory().isActive(),
					p.getCondition() == null ? null : p.getCondition().name(), p.isNegotiable(), p.getArea(),
					p.getBlockedReason());
		}
	}

	/** {@code specs}: the answers to the category's detail fields (brand, RAM, ...), for the edit form. */
	public record ProductDetail(ProductRow product, String description, List<ImageView> images,
			int maxImages, Map<String, Object> specs) {

		private static final tools.jackson.databind.ObjectMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();

		public static ProductDetail of(Product p, List<ProductImage> gallery, MediaProperties media) {
			return new ProductDetail(ProductRow.of(p), p.getDescription(),
					gallery.stream().map(i -> ImageView.of(i, media)).toList(), CatalogAdminService.MAX_IMAGES,
					JSON.readValue(p.getSpecs() == null ? "{}" : p.getSpecs(), new tools.jackson.core.type.TypeReference<java.util.LinkedHashMap<String, Object>>() {
					}));
		}
	}

	public record CategoryRow(Long id, String name, String slug, int sortOrder, boolean active, long productCount,
			long activeProductCount, Long parentId, long fieldCount) {
	}

	public record ChangeRow(Long id, String action, String detail, String userEmail, Instant createdAt) {

		public static ChangeRow of(CatalogChange c) {
			return new ChangeRow(c.getId(), c.getAction(), c.getDetail(), c.getUserEmail(), c.getCreatedAt());
		}
	}

	// ---------- products ----------

	@GetMapping("/products")
	@Transactional(readOnly = true)
	public PageDto<ProductRow> list(@RequestParam(required = false) String q,
			@RequestParam(required = false) Long categoryId, @RequestParam(required = false) String status,
			@RequestParam(required = false) String seller,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		String query = q == null || q.isBlank() ? null : q.trim();
		String st = status == null || status.isBlank() || "all".equals(status) ? null : status;
		// seller: empty = everyone, "house" = Sodo Gebeya's own, a number = that shop
		boolean house = "house".equals(seller);
		Long shopId = seller != null && seller.matches("\\d{1,18}") ? Long.valueOf(seller) : null;
		return PageDto.of(products.adminSearch(query, categoryId, st, shopId, house,
				PageRequest.of(page, Math.min(size, 100), Sort.by("id").descending())).map(ProductRow::of));
	}

	@GetMapping("/products/{id}")
	@Transactional(readOnly = true)
	public ProductDetail get(@PathVariable Long id) {
		return detail(products.findWithCategoryById(id).orElseThrow(() -> ApiException.notFound("Product")));
	}

	@PostMapping("/products")
	public ProductDetail create(@Valid @RequestBody ProductRequest req) {
		return detailOf(catalog.create(req.form()).getId());
	}

	@PutMapping("/products/{id}")
	public ProductDetail update(@PathVariable Long id, @Valid @RequestBody ProductRequest req) {
		return detailOf(catalog.update(id, req.form()).getId());
	}

	@PatchMapping("/products/{id}/visibility")
	public ProductDetail visibility(@PathVariable Long id, @Valid @RequestBody VisibilityRequest req) {
		return detailOf(catalog.setActive(id, req.active()).getId());
	}

	@PostMapping("/products/{id}/stock")
	public ProductDetail stock(@PathVariable Long id, @Valid @RequestBody StockRequest req) {
		return detailOf(catalog.adjustStock(id, req.delta(), req.reason()).getId());
	}

	@PostMapping("/products/{id}/duplicate")
	public ProductDetail duplicate(@PathVariable Long id) {
		return detailOf(catalog.duplicate(id).getId());
	}

	@GetMapping("/products/{id}/changes")
	@Transactional(readOnly = true)
	public PageDto<ChangeRow> productChanges(@PathVariable Long id, @RequestParam(defaultValue = "0") int page) {
		return PageDto.of(changes.findByEntityTypeAndEntityId(CatalogChange.EntityType.PRODUCT, id,
				PageRequest.of(page, 20, Sort.by("createdAt").descending())).map(ChangeRow::of));
	}

	// ---------- photos ----------

	@PostMapping(path = "/products/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProductDetail upload(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo to upload.");
		}
		catalog.addImage(id, file.getBytes());
		return detailOf(id);
	}

	@DeleteMapping("/products/{id}/images/{imageId}")
	public ProductDetail removeImage(@PathVariable Long id, @PathVariable Long imageId) {
		catalog.removeImage(id, imageId);
		return detailOf(id);
	}

	@PutMapping("/products/{id}/images/order")
	public ProductDetail reorderImages(@PathVariable Long id, @Valid @RequestBody OrderRequest req) {
		catalog.reorderImages(id, req.ids());
		return detailOf(id);
	}

	// ---------- categories ----------

	@GetMapping("/categories")
	@Transactional(readOnly = true)
	public List<CategoryRow> categories() {
		Map<Long, long[]> counts = new HashMap<>();
		for (Object[] row : categories.productCounts()) {
			counts.put((Long) row[0], new long[] { ((Number) row[1]).longValue(), ((Number) row[2]).longValue() });
		}
		Map<Long, Long> fieldCounts = new HashMap<>();
		for (et.tenapay.shop.catalog.CategoryField f : fields.findAll()) {
			fieldCounts.merge(f.getCategoryId(), 1L, Long::sum);
		}
		return categories.findAllByOrderBySortOrderAscIdAsc().stream().map(c -> {
			long[] n = counts.getOrDefault(c.getId(), new long[] { 0, 0 });
			return new CategoryRow(c.getId(), c.getName(), c.getSlug(), c.getSortOrder(), c.isActive(), n[0], n[1], c.getParentId(),
					fieldCounts.getOrDefault(c.getId(), 0L));
		}).toList();
	}

	@PostMapping("/categories")
	public List<CategoryRow> createCategory(@Valid @RequestBody CategoryRequest req) {
		if (req.name() == null || req.name().isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "Enter a category name.");
		}
		catalog.createCategory(req.name(), req.parentId());
		return categories();
	}

	@PatchMapping("/categories/{id}")
	public List<CategoryRow> updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
		catalog.updateCategory(id, req.name(), req.active(), req.parentId(), req.mainCategory());
		return categories();
	}

	@PutMapping("/categories/order")
	public List<CategoryRow> reorderCategories(@Valid @RequestBody OrderRequest req) {
		catalog.reorderCategories(req.ids());
		return categories();
	}

	// ---------- helpers ----------

	private ProductDetail detailOf(Long id) {
		return detail(products.findWithCategoryById(id).orElseThrow());
	}

	private ProductDetail detail(Product p) {
		return ProductDetail.of(p, images.findByProductIdOrderByPositionAsc(p.getId()), media);
	}
}
