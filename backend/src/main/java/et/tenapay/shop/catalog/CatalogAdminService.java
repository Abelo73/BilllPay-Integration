package et.tenapay.shop.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Catalog editing for the admin. Every change is recorded in catalog_changes. */
@Slf4j
@Service
@RequiredArgsConstructor
public class CatalogAdminService {

	public static final int MAX_IMAGES = 5;

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final ProductImageRepository images;
	private final CatalogChangeRepository changes;
	private final ImageProcessor imageProcessor;
	private final MediaStorage storage;
	private final MediaProperties media;
	private final TransactionTemplate tx;

	public record ProductForm(String name, String slug, String description, Long categoryId, BigDecimal price,
			Integer stock, Integer lowStockThreshold, Boolean featured, Boolean active) {
	}

	// ---------- products ----------

	public Product create(ProductForm f) {
		return tx.execute(s -> {
			Product p = new Product();
			p.setCategory(category(f.categoryId()));
			p.setName(f.name().trim());
			p.setSlug(uniqueProductSlug(f.slug() != null && !f.slug().isBlank() ? f.slug() : f.name(), null));
			p.setDescription(blankToNull(f.description()));
			p.setPrice(money(f.price()));
			p.setCurrency("ETB");
			p.setStock(f.stock() == null ? 0 : f.stock());
			p.setLowStockThreshold(f.lowStockThreshold() == null ? 5 : f.lowStockThreshold());
			p.setFeatured(Boolean.TRUE.equals(f.featured()));
			p.setActive(f.active() == null || f.active());
			products.save(p);
			record(CatalogChange.EntityType.PRODUCT, p.getId(), "CREATED",
					p.getName() + " · " + p.getPrice() + " ETB · stock " + p.getStock());
			return p;
		});
	}

	/** Updates the descriptive fields; stock changes go through {@link #adjustStock}. */
	public Product update(Long id, ProductForm f) {
		return tx.execute(s -> {
			Product p = products.lockById(id).orElseThrow(() -> ApiException.notFound("Product"));
			List<String> diff = new ArrayList<>();
			if (f.name() != null && !f.name().isBlank() && !f.name().trim().equals(p.getName())) {
				diff.add("name \"" + p.getName() + "\" → \"" + f.name().trim() + "\"");
				p.setName(f.name().trim());
			}
			if (f.slug() != null && !f.slug().isBlank()) {
				String slug = uniqueProductSlug(f.slug(), p.getId());
				if (!slug.equals(p.getSlug())) {
					diff.add("slug " + p.getSlug() + " → " + slug);
					p.setSlug(slug);
				}
			}
			if (f.description() != null && !Objects.equals(blankToNull(f.description()), p.getDescription())) {
				diff.add("description edited");
				p.setDescription(blankToNull(f.description()));
			}
			if (f.categoryId() != null && !f.categoryId().equals(p.getCategory().getId())) {
				Category c = category(f.categoryId());
				diff.add("category " + p.getCategory().getName() + " → " + c.getName());
				p.setCategory(c);
			}
			if (f.price() != null && money(f.price()).compareTo(p.getPrice()) != 0) {
				BigDecimal price = money(f.price());
				diff.add("price " + p.getPrice() + " → " + price);
				p.setPrice(price);
			}
			if (f.lowStockThreshold() != null && f.lowStockThreshold() != p.getLowStockThreshold()) {
				diff.add("low-stock alert " + p.getLowStockThreshold() + " → " + f.lowStockThreshold());
				p.setLowStockThreshold(f.lowStockThreshold());
			}
			if (f.featured() != null && f.featured() != p.isFeatured()) {
				diff.add(f.featured() ? "featured on" : "featured off");
				p.setFeatured(f.featured());
			}
			if (f.active() != null && f.active() != p.isActive()) {
				diff.add(f.active() ? "shown in store" : "hidden from store");
				p.setActive(f.active());
			}
			if (!diff.isEmpty()) {
				record(CatalogChange.EntityType.PRODUCT, p.getId(), "UPDATED", String.join("; ", diff));
			}
			return p;
		});
	}

	public Product setActive(Long id, boolean active) {
		return tx.execute(s -> {
			Product p = products.lockById(id).orElseThrow(() -> ApiException.notFound("Product"));
			if (p.isActive() != active) {
				p.setActive(active);
				record(CatalogChange.EntityType.PRODUCT, id, active ? "SHOWN" : "HIDDEN", null);
			}
			return p;
		});
	}

	/** Adds or removes units; stock can't drop below what unpaid orders are holding. */
	public Product adjustStock(Long id, int delta, String reason) {
		if (delta == 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NO_CHANGE", "Enter a number other than 0.");
		}
		return tx.execute(s -> {
			Product p = products.lockById(id).orElseThrow(() -> ApiException.notFound("Product"));
			int next = p.getStock() + delta;
			if (next < p.getReserved()) {
				throw new ApiException(HttpStatus.CONFLICT, "BELOW_RESERVED",
						"Stock can't go below " + p.getReserved() + ": that many units are held by unpaid orders.",
						Map.of("reserved", p.getReserved()));
			}
			int before = p.getStock();
			p.setStock(next);
			record(CatalogChange.EntityType.PRODUCT, id, "STOCK_ADJUSTED",
					(delta > 0 ? "+" : "") + delta + " (" + before + " → " + next + ")"
							+ (reason != null && !reason.isBlank() ? ": " + reason.trim() : ""));
			return p;
		});
	}

	/** Copies a product (hidden, no stock) including its photos, so it can be edited into a variant. */
	public Product duplicate(Long id) {
		Product source = products.findById(id).orElseThrow(() -> ApiException.notFound("Product"));
		List<ProductImage> sourceImages = images.findByProductIdOrderByPositionAsc(id);
		Product copy = tx.execute(s -> {
			Product p = new Product();
			p.setCategory(source.getCategory());
			p.setName(source.getName() + " (copy)");
			p.setSlug(uniqueProductSlug(source.getSlug() + "-copy", null));
			p.setDescription(source.getDescription());
			p.setPrice(source.getPrice());
			p.setCurrency(source.getCurrency());
			p.setStock(0);
			p.setLowStockThreshold(source.getLowStockThreshold());
			p.setFeatured(false);
			p.setActive(false);
			p.setImageUrl(sourceImages.isEmpty() ? source.getImageUrl() : null);
			products.save(p);
			record(CatalogChange.EntityType.PRODUCT, p.getId(), "DUPLICATED", "from #" + source.getId() + " " + source.getName());
			return p;
		});
		for (ProductImage img : sourceImages) {
			String base = keyBase(copy.getId());
			storage.copy(img.getLargeKey(), base + "-l.jpg");
			storage.copy(img.getThumbKey(), base + "-t.jpg");
			tx.executeWithoutResult(s -> {
				ProductImage c = new ProductImage();
				c.setProductId(copy.getId());
				c.setPosition(img.getPosition());
				c.setLargeKey(base + "-l.jpg");
				c.setThumbKey(base + "-t.jpg");
				c.setWidth(img.getWidth());
				c.setHeight(img.getHeight());
				c.setSizeBytes(img.getSizeBytes());
				images.save(c);
			});
		}
		syncMainImage(copy.getId());
		return products.findById(copy.getId()).orElseThrow();
	}

	// ---------- photos ----------

	public ProductImage addImage(Long productId, byte[] upload) {
		Product p = products.findById(productId).orElseThrow(() -> ApiException.notFound("Product"));
		if (images.countByProductId(productId) >= MAX_IMAGES) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_IMAGES",
					"A product can have up to " + MAX_IMAGES + " photos. Remove one first.");
		}
		ImageProcessor.Processed img = imageProcessor.process(upload);
		String base = keyBase(productId);
		storage.put(base + "-l.jpg", img.large(), "image/jpeg");
		storage.put(base + "-t.jpg", img.thumb(), "image/jpeg");
		ProductImage saved = tx.execute(s -> {
			ProductImage row = new ProductImage();
			row.setProductId(productId);
			row.setPosition((int) images.countByProductId(productId));
			row.setLargeKey(base + "-l.jpg");
			row.setThumbKey(base + "-t.jpg");
			row.setWidth(img.width());
			row.setHeight(img.height());
			row.setSizeBytes(img.large().length);
			images.save(row);
			record(CatalogChange.EntityType.PRODUCT, productId, "IMAGE_ADDED",
					img.width() + "×" + img.height() + ", " + (img.large().length / 1024) + " KB");
			return row;
		});
		syncMainImage(p.getId());
		return saved;
	}

	public void removeImage(Long productId, Long imageId) {
		ProductImage img = images.findById(imageId).filter(i -> i.getProductId().equals(productId))
				.orElseThrow(() -> ApiException.notFound("Photo"));
		tx.executeWithoutResult(s -> {
			images.delete(img);
			renumber(productId, null);
			record(CatalogChange.EntityType.PRODUCT, productId, "IMAGE_REMOVED", "photo #" + imageId);
		});
		storage.delete(img.getLargeKey());
		storage.delete(img.getThumbKey());
		syncMainImage(productId);
	}

	/** Sets the photo order; the first id becomes the main photo. */
	public List<ProductImage> reorderImages(Long productId, List<Long> orderedIds) {
		tx.executeWithoutResult(s -> {
			List<ProductImage> current = images.findByProductIdOrderByPositionAsc(productId);
			if (orderedIds == null || orderedIds.size() != current.size()
					|| !current.stream().map(ProductImage::getId).allMatch(orderedIds::contains)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_ORDER", "Send every photo id of this product exactly once.");
			}
			renumber(productId, orderedIds);
			record(CatalogChange.EntityType.PRODUCT, productId, "IMAGES_REORDERED", "main photo #" + orderedIds.get(0));
		});
		syncMainImage(productId);
		return images.findByProductIdOrderByPositionAsc(productId);
	}

	private void renumber(Long productId, List<Long> order) {
		List<ProductImage> list = new ArrayList<>(images.findByProductIdOrderByPositionAsc(productId));
		if (order != null) {
			list.sort((a, b) -> Integer.compare(order.indexOf(a.getId()), order.indexOf(b.getId())));
		}
		for (int i = 0; i < list.size(); i++) {
			list.get(i).setPosition(i);
		}
	}

	/** products.image_url follows the first photo, so lists, carts and checkout need no join. */
	private void syncMainImage(Long productId) {
		tx.executeWithoutResult(s -> {
			Product p = products.findById(productId).orElseThrow();
			List<ProductImage> list = images.findByProductIdOrderByPositionAsc(productId);
			if (!list.isEmpty()) {
				p.setImageUrl(media.urlFor(list.get(0).getLargeKey()));
			} else if (p.getImageUrl() != null && p.getImageUrl().startsWith(media.publicPath())) {
				p.setImageUrl(null); // last uploaded photo removed
			}
		});
	}

	// ---------- categories ----------

	public Category createCategory(String name) {
		return tx.execute(s -> {
			Category c = new Category();
			c.setName(name.trim());
			c.setSlug(Slugs.unique(Slugs.slugify(name), "category", categories::existsBySlug));
			c.setSortOrder(categories.maxSortOrder() + 1);
			categories.save(c);
			record(CatalogChange.EntityType.CATEGORY, c.getId(), "CREATED", c.getName());
			return c;
		});
	}

	public Category updateCategory(Long id, String name, Boolean active) {
		return tx.execute(s -> {
			Category c = category(id);
			List<String> diff = new ArrayList<>();
			if (name != null && !name.isBlank() && !name.trim().equals(c.getName())) {
				diff.add("name \"" + c.getName() + "\" → \"" + name.trim() + "\"");
				c.setName(name.trim());
			}
			if (active != null && active != c.isActive()) {
				diff.add(active ? "shown in store" : "hidden from store (its products too)");
				c.setActive(active);
			}
			if (!diff.isEmpty()) {
				record(CatalogChange.EntityType.CATEGORY, id, "UPDATED", String.join("; ", diff));
			}
			return c;
		});
	}

	public List<Category> reorderCategories(List<Long> orderedIds) {
		return tx.execute(s -> {
			List<Category> all = categories.findAllByOrderBySortOrderAscIdAsc();
			if (orderedIds == null || orderedIds.size() != all.size()
					|| !all.stream().map(Category::getId).allMatch(orderedIds::contains)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_ORDER", "Send every category id exactly once.");
			}
			Map<Long, Category> byId = new HashMap<>();
			all.forEach(c -> byId.put(c.getId(), c));
			for (int i = 0; i < orderedIds.size(); i++) {
				byId.get(orderedIds.get(i)).setSortOrder(i + 1);
			}
			record(CatalogChange.EntityType.CATEGORY, 0L, "REORDERED", null);
			return categories.findAllByOrderBySortOrderAscIdAsc();
		});
	}

	// ---------- helpers ----------

	private Category category(Long id) {
		if (id == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "CATEGORY_REQUIRED", "Choose a category.");
		}
		return categories.findById(id).orElseThrow(() -> ApiException.notFound("Category"));
	}

	private String uniqueProductSlug(String wanted, Long selfId) {
		String base = Slugs.slugify(wanted);
		return Slugs.unique(base, "product", slug -> products.existsBySlug(slug)
				&& (selfId == null || !products.findById(selfId).map(Product::getSlug).orElse("").equals(slug)));
	}

	private static BigDecimal money(BigDecimal v) {
		if (v == null || v.signum() <= 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PRICE", "Price must be more than 0.");
		}
		return v.setScale(2, RoundingMode.HALF_UP);
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}

	private static String keyBase(Long productId) {
		return "products/" + productId + "/" + UUID.randomUUID();
	}

	private void record(CatalogChange.EntityType type, Long id, String action, String detail) {
		CatalogChange c = new CatalogChange();
		c.setEntityType(type);
		c.setEntityId(id);
		c.setAction(action);
		c.setDetail(detail);
		CurrentUser.get().ifPresent(u -> {
			c.setUserId(u.id());
			c.setUserEmail(u.email());
		});
		changes.save(c);
		log.info("Catalog {} #{} {} {}", type, id, action, detail == null ? "" : detail);
	}
}
