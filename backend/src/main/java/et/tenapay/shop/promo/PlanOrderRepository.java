package et.tenapay.shop.promo;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanOrderRepository extends JpaRepository<PlanOrder, Long> {

	List<PlanOrder> findByShopIdOrderByIdDesc(Long shopId);

	Page<PlanOrder> findByStatusIn(Collection<PlanOrder.Status> statuses, Pageable pageable);

	long countByStatus(PlanOrder.Status status);

	boolean existsByShopIdAndStatus(Long shopId, PlanOrder.Status status);
}
