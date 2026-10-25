package et.tenapay.shop.work;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@SuppressWarnings("unused")
public interface CvOrderRepository extends JpaRepository<CvOrder, Long> {

	List<CvOrder> findByUserIdOrderByCreatedAtDesc(UUID userId);

	Page<CvOrder> findByStatusIn(java.util.Collection<CvOrder.Status> statuses, Pageable pageable);

	long countByStatusIn(java.util.Collection<CvOrder.Status> statuses);
}
