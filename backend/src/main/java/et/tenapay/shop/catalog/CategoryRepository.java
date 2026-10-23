package et.tenapay.shop.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CategoryRepository extends JpaRepository<Category, Long> {

	List<Category> findAllByOrderBySortOrderAscIdAsc();

	List<Category> findByActiveTrueOrderBySortOrderAscIdAsc();

	boolean existsBySlug(String slug);

	@Query("select coalesce(max(c.sortOrder), 0) from Category c")
	int maxSortOrder();

	/** [categoryId, product count, active product count] */
	@Query("select p.category.id, count(p), sum(case when p.active = true then 1 else 0 end) from Product p group by p.category.id")
	List<Object[]> productCounts();
}
