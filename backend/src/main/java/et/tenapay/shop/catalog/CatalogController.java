package et.tenapay.shop.catalog;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogController {

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final ProductImageRepository images;
	private final MediaProperties media;
	private final et.tenapay.shop.seller.ShopRepository shops;

	public record ImageDto(String url, String thumbUrl) {
	}

	/** Who sells a product; null on the product = Sodo Gebeya itself. */
	public record SellerDto(String name, String slug, String kind, String area, boolean verified) {

		static SellerDto of(et.tenapay.shop.seller.Shop s) {
			return s == null ? null
					: new SellerDto(s.getName(), s.getSlug(), s.getKind().name(), s.getArea(), s.getVerifiedAt() != null);
		}
	}

	/** {@code images} is filled on the product page only; lists use {@code imageUrl}. */
	public record ProductDto(Long id, String name, String slug, String description, BigDecimal price,
			String currency, int available, boolean lowStock, String imageUrl, boolean featured, String categorySlug,
			String categoryName, List<ImageDto> images, SellerDto seller, String condition, boolean negotiable,
			String area) {

		public static ProductDto from(Product p, List<ImageDto> images) {
			return new ProductDto(p.getId(), p.getName(), p.getSlug(), p.getDescription(), p.getPrice(),
					p.getCurrency(), Math.max(0, p.available()), p.lowStock(), p.getImageUrl(), p.isFeatured(),
					p.getCategory().getSlug(), p.getCategory().getName(), images, SellerDto.of(p.getShop()),
					p.getCondition() == null ? null : p.getCondition().name(), p.isNegotiable(), p.effectiveArea());
		}

		public static ProductDto from(Product p) {
			return from(p, List.of());
		}
	}

	public record CategoryDto(Long id, String name, String slug) {
	}

	@GetMapping("/products")
	public PageDto<ProductDto> list(@RequestParam(required = false) String category,
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String shop,
			@RequestParam(defaultValue = "newest") String sort,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "12") int size) {
		Sort order = switch (sort) {
			case "price_asc" -> Sort.by("price").ascending();
			case "price_desc" -> Sort.by("price").descending();
			case "name" -> Sort.by("name").ascending();
			default -> Sort.by("id").descending();
		};
		String query = (q == null || q.isBlank()) ? null : q.trim();
		String cat = (category == null || category.isBlank()) ? null : category;
		Long shopId = null;
		if (shop != null && !shop.isBlank()) {
			// one seller's products (their shop page); an unknown or unapproved shop has none
			shopId = shops.findBySlug(shop).filter(s -> s.getStatus().selling()).map(et.tenapay.shop.seller.Shop::getId)
					.orElse(-1L);
		}
		return PageDto.of(products.search(cat, query, shopId, PageRequest.of(page, Math.min(size, 48), order))
				.map(ProductDto::from));
	}

	@GetMapping("/products/featured")
	public List<ProductDto> featured() {
		return products.findFeaturedVisible().stream().map(ProductDto::from).toList();
	}

	@GetMapping("/products/{slug}")
	public ProductDto get(@PathVariable String slug) {
		Product p = products.findVisibleBySlug(slug).orElseThrow(() -> ApiException.notFound("Product"));
		List<ImageDto> gallery = images.findByProductIdOrderByPositionAsc(p.getId()).stream()
				.map(i -> new ImageDto(media.urlFor(i.getLargeKey()), media.urlFor(i.getThumbKey())))
				.toList();
		if (gallery.isEmpty() && p.getImageUrl() != null) {
			gallery = List.of(new ImageDto(p.getImageUrl(), p.getImageUrl())); // seeded photo from /products
		}
		return ProductDto.from(p, gallery);
	}

	@GetMapping("/categories")
	public List<CategoryDto> categories() {
		return categories.findByActiveTrueOrderBySortOrderAscIdAsc().stream()
				.map(c -> new CategoryDto(c.getId(), c.getName(), c.getSlug())).toList();
	}
}
