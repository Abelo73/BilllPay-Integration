package et.tenapay.shop.promo;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoostRepository extends JpaRepository<Boost, Long> {

	List<Boost> findByShopIdOrderByIdDesc(Long shopId);

	List<Boost> findByProductIdOrderByIdDesc(Long productId);

	Page<Boost> findByStatusIn(Collection<Boost.Status> statuses, Pageable pageable);

	long countByStatus(Boost.Status status);

	boolean existsByProductIdAndStatusIn(Long productId, Collection<Boost.Status> statuses);

	List<Boost> findByStatusAndEndsAtBefore(Boost.Status status, Instant before);
}
