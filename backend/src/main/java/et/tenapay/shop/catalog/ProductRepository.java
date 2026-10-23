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

	@EntityGraph(attributePaths = "category")
	@Query("""
			select p from Product p
			where p.active = true
			  and (:category is null or p.category.slug = :category)
			  and (:q is null or lower(p.name) like lower(concat('%', cast(:q as string), '%')))
			""")
	Page<Product> search(@Param("category") String category, @Param("q") String q, Pageable pageable);

	@EntityGraph(attributePaths = "category")
	Optional<Product> findBySlugAndActiveTrue(String slug);

	@EntityGraph(attributePaths = "category")
	List<Product> findByFeaturedTrueAndActiveTrueOrderByIdAsc();

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id in :ids order by p.id")
	List<Product> lockAllById(@Param("ids") Collection<Long> ids);
}
