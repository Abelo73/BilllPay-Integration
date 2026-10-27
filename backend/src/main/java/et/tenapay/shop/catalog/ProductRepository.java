package et.tenapay.shop.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface ProductRepository extends JpaRepository<Product, Long> {

	// The store shows a product only when it is switched on, its category is shown, and its seller is approved
	// (shop is null = sold by Sodo Gebeya itself), and staff haven't taken it down after reports. A pending, rejected or
	// suspended shop's products stay hidden.

	/** Store listing: active products in visible categories, from approved sellers; optionally one shop's. */
	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p left join p.shop s
			where p.active = true and p.category.active = true
			  and p.blockedReason is null and (s is null or s.status = et.tenapay.shop.seller.ShopStatus.APPROVED)
			  and (:category is null or p.category.slug = :category
			       or p.category.parentId in (select c.id from Category c where c.slug = :category))
			  and (:shopId is null or s.id = :shopId)
			  and (:q is null or lower(p.name) like lower(concat('%', cast(:q as string), '%'))
			       or function('specs_has_text', p.specs, cast(:q as string)) = true)
			  and function('specs_match', p.specs, coalesce(cast(:specs as string), '{}')) = true
			  and (:minPrice is null or p.price >= :minPrice)
			  and (:maxPrice is null or p.price <= :maxPrice)
			  and p.id > :afterId
			  and (:area is null or lower(coalesce(p.area, s.area)) = lower(cast(:area as string)))
			order by case when p.boostedUntil > current_timestamp then 0 else 1 end,
			  case when lower(coalesce(p.area, s.area)) = lower(coalesce(cast(:near as string), '')) then 0 else 1 end
			""")
	Page<Product> search(@Param("category") String category, @Param("q") String q, @Param("shopId") Long shopId,
			@Param("specs") String specs, @Param("minPrice") java.math.BigDecimal minPrice, @Param("maxPrice") java.math.BigDecimal maxPrice,
			@Param("afterId") long afterId, @Param("area") String area, @Param("near") String near, Pageable pageable);

	/** Without the area filter and "near me first" (saved-search alerts). */
	default Page<Product> search(String category, String q, Long shopId, String specs, java.math.BigDecimal minPrice,
			java.math.BigDecimal maxPrice, long afterId, Pageable pageable) {
		return search(category, q, shopId, specs, minPrice, maxPrice, afterId, null, null, pageable);
	}

	/** Store listing with detail filters (no price range). */
	default Page<Product> search(String category, String q, Long shopId, String specs, Pageable pageable) {
		return search(category, q, shopId, specs, null, null, 0L, pageable);
	}

	/** Store listing without spec filters. A main category's slug also lists its subcategories' products. */
	default Page<Product> search(String category, String q, Long shopId, Pageable pageable) {
		return search(category, q, shopId, null, pageable);
	}

	/** Store product page: hidden products, hidden categories and unapproved sellers are not found. */
	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p left join p.shop s
			where p.slug = :slug and p.active = true and p.category.active = true
			  and p.blockedReason is null and (s is null or s.status = et.tenapay.shop.seller.ShopStatus.APPROVED)
			""")
	Optional<Product> findVisibleBySlug(@Param("slug") String slug);

	/** Same visibility rules, by id (favourites). */
	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p left join p.shop s
			where p.id = :id and p.active = true and p.category.active = true
			  and p.blockedReason is null and (s is null or s.status = et.tenapay.shop.seller.ShopStatus.APPROVED)
			""")
	Optional<Product> findVisibleById(@Param("id") Long id);

	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p left join p.shop s
			where p.featured = true and p.active = true and p.category.active = true
			  and p.blockedReason is null and (s is null or s.status = et.tenapay.shop.seller.ShopStatus.APPROVED)
			order by p.id
			""")
	List<Product> findFeaturedVisible();

	/** M16: boosted listings for the home page, the newest boost first. */
	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p left join p.shop s
			where p.boostedUntil > current_timestamp and p.active = true and p.category.active = true
			  and p.blockedReason is null and (s is null or s.status = et.tenapay.shop.seller.ShopStatus.APPROVED)
			order by p.boostedUntil desc
			""")
	List<Product> findBoostedVisible(Pageable pageable);

	/**
	 * Admin and seller listing with status filter: active, hidden, low (low stock) or out (nothing available).
	 * {@code shopId} limits it to one seller (sellers always pass their own); {@code houseOnly} to Sodo Gebeya's own.
	 */
	@EntityGraph(attributePaths = { "category", "shop" })
	@Query("""
			select p from Product p
			where (:q is null or lower(p.name) like lower(concat('%', cast(:q as string), '%'))
			       or lower(p.slug) like lower(concat('%', cast(:q as string), '%')))
			  and (:categoryId is null or p.category.id = :categoryId)
			  and (:shopId is null or p.shop.id = :shopId)
			  and (:houseOnly = false or p.shop is null)
			  and (:status is null
			       or (:status = 'active' and p.active = true and p.blockedReason is null)
			       or (:status = 'blocked' and p.blockedReason is not null)
			       or (:status = 'hidden' and p.active = false)
			       or (:status = 'low' and p.stock - p.reserved > 0 and p.stock - p.reserved <= p.lowStockThreshold)
			       or (:status = 'out' and p.stock - p.reserved <= 0))
			""")
	Page<Product> adminSearch(@Param("q") String q, @Param("categoryId") Long categoryId,
			@Param("status") String status, @Param("shopId") Long shopId, @Param("houseOnly") boolean houseOnly,
			Pageable pageable);

	@EntityGraph(attributePaths = { "category", "shop" })
	Optional<Product> findWithCategoryById(Long id);

	/** For the seller dashboard: [products, shown in store, low stock, sold out]. */
	@Query("""
			select count(p), coalesce(sum(case when p.active = true then 1 else 0 end), 0),
			    coalesce(sum(case when p.stock - p.reserved > 0 and p.stock - p.reserved <= p.lowStockThreshold then 1 else 0 end), 0),
			    coalesce(sum(case when p.stock - p.reserved <= 0 then 1 else 0 end), 0)
			from Product p where p.shop.id = :shopId
			""")
	List<Object[]> shopCounts(@Param("shopId") Long shopId);

	boolean existsBySlug(String slug);

	/** The newest product id (a saved search only alerts about listings after it). */
	@Query("select coalesce(max(p.id), 0) from Product p")
	long maxId();

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id = :id")
	Optional<Product> lockById(@Param("id") Long id);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id in :ids order by p.id")
	List<Product> lockAllById(@Param("ids") Collection<Long> ids);

	// Stock changes as single statements: the row is locked only from this statement to the commit, instead of for
	// the whole transaction. Under load, shoppers buying the same product waited seconds for each other with
	// SELECT ... FOR UPDATE at the start of checkout (docs/PERFORMANCE.md). Callers run them in product-id order.

	/** Reserves qty if that much is still available; returns 0 (nothing changed) when it isn't. */
	@Modifying(flushAutomatically = true)
	@Query("""
			update Product p set p.reserved = p.reserved + :qty, p.version = p.version + 1
			where p.id = :id and p.active = true and p.stock - p.reserved >= :qty
			""")
	int reserveIfAvailable(@Param("id") Long id, @Param("qty") int qty);

	/** Gives a reservation back (unpaid order cancelled or expired). */
	@Modifying(flushAutomatically = true)
	@Query("""
			update Product p set p.reserved = case when p.reserved >= :qty then p.reserved - :qty else 0 end,
			    p.version = p.version + 1
			where p.id = :id
			""")
	int releaseReserved(@Param("id") Long id, @Param("qty") int qty);

	/** Turns a reservation into a sale (order paid). */
	@Modifying(flushAutomatically = true)
	@Query("""
			update Product p set p.reserved = case when p.reserved >= :qty then p.reserved - :qty else 0 end,
			    p.stock = case when p.stock >= :qty then p.stock - :qty else 0 end,
			    p.version = p.version + 1
			where p.id = :id
			""")
	int commitReserved(@Param("id") Long id, @Param("qty") int qty);
}
