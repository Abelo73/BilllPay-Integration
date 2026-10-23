package et.tenapay.shop.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface ProductRepository extends JpaRepository<Product, Long> {

	/** Store listing: active products in visible categories. */
	@EntityGraph(attributePaths = "category")
	@Query("""
			select p from Product p
			where p.active = true and p.category.active = true
			  and (:category is null or p.category.slug = :category)
			  and (:q is null or lower(p.name) like lower(concat('%', cast(:q as string), '%')))
			""")
	Page<Product> search(@Param("category") String category, @Param("q") String q, Pageable pageable);

	/** Store product page: hidden products and products in hidden categories are not found. */
	@EntityGraph(attributePaths = "category")
	@Query("select p from Product p where p.slug = :slug and p.active = true and p.category.active = true")
	Optional<Product> findVisibleBySlug(@Param("slug") String slug);

	@EntityGraph(attributePaths = "category")
	@Query("select p from Product p where p.featured = true and p.active = true and p.category.active = true order by p.id")
	List<Product> findFeaturedVisible();

	/** Admin listing with status filter: active, hidden, low (low stock) or out (nothing available). */
	@EntityGraph(attributePaths = "category")
	@Query("""
			select p from Product p
			where (:q is null or lower(p.name) like lower(concat('%', cast(:q as string), '%'))
			       or lower(p.slug) like lower(concat('%', cast(:q as string), '%')))
			  and (:categoryId is null or p.category.id = :categoryId)
			  and (:status is null
			       or (:status = 'active' and p.active = true)
			       or (:status = 'hidden' and p.active = false)
			       or (:status = 'low' and p.stock - p.reserved > 0 and p.stock - p.reserved <= p.lowStockThreshold)
			       or (:status = 'out' and p.stock - p.reserved <= 0))
			""")
	Page<Product> adminSearch(@Param("q") String q, @Param("categoryId") Long categoryId,
			@Param("status") String status, Pageable pageable);

	@EntityGraph(attributePaths = "category")
	Optional<Product> findWithCategoryById(Long id);

	boolean existsBySlug(String slug);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id = :id")
	Optional<Product> lockById(@Param("id") Long id);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id in :ids order by p.id")
	List<Product> lockAllById(@Param("ids") Collection<Long> ids);
}
