package et.tenapay.shop.seller;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShopRepository extends JpaRepository<Shop, Long> {

	Optional<Shop> findByOwnerId(UUID ownerId);

	Optional<Shop> findBySlug(String slug);

	boolean existsBySlug(String slug);

	@Query("""
			select s from Shop s
			where (:status is null or s.status = :status)
			  and (:q is null or lower(s.name) like lower(concat('%', cast(:q as string), '%'))
			       or s.phone like concat('%', cast(:q as string), '%'))
			""")
	Page<Shop> adminSearch(@Param("status") ShopStatus status, @Param("q") String q, Pageable pageable);

	long countByStatus(ShopStatus status);

	/** [shopId, all products, products shown in the store] */
	@Query("""
			select p.shop.id, count(p), sum(case when p.active = true then 1 else 0 end)
			from Product p where p.shop.id in :ids group by p.shop.id
			""")
	List<Object[]> productCounts(@Param("ids") List<Long> ids);
}
