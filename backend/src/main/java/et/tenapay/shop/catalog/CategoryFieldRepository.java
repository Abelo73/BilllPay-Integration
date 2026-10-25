package et.tenapay.shop.catalog;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CategoryFieldRepository extends JpaRepository<CategoryField, Long> {

	List<CategoryField> findByCategoryIdInOrderByPositionAscIdAsc(Collection<Long> categoryIds);

	List<CategoryField> findByCategoryIdOrderByPositionAscIdAsc(Long categoryId);

	boolean existsByCategoryIdAndKey(Long categoryId, String key);

	@Query("select coalesce(max(f.position), 0) from CategoryField f where f.categoryId = :categoryId")
	int maxPosition(@org.springframework.data.repository.query.Param("categoryId") Long categoryId);
}
