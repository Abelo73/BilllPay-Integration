package et.tenapay.shop.dispute;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeRepository extends JpaRepository<Dispute, Long> {

	boolean existsByParcelIdAndStatus(Long parcelId, Dispute.Status status);

	List<Dispute> findByOrderIdOrderByIdDesc(UUID orderId);

	List<Dispute> findByBuyerIdOrderByIdDesc(UUID buyerId);

	List<Dispute> findByShopIdOrderByIdDesc(Long shopId);

	Page<Dispute> findByStatusIn(Collection<Dispute.Status> statuses, Pageable pageable);

	long countByStatus(Dispute.Status status);

	long countByShopIdAndStatus(Long shopId, Dispute.Status status);
}
