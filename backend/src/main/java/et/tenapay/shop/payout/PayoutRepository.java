package et.tenapay.shop.payout;

import java.math.BigDecimal;
import java.util.Collection;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PayoutRepository extends JpaRepository<Payout, Long> {

	Page<Payout> findByShopIdOrderByRequestedAtDesc(Long shopId, Pageable pageable);

	Page<Payout> findByStatus(PayoutStatus status, Pageable pageable);

	long countByStatus(PayoutStatus status);

	boolean existsByShopIdAndStatus(Long shopId, PayoutStatus status);

	@Query("select coalesce(sum(p.amount), 0) from Payout p where p.shopId = :shopId and p.status in :statuses")
	BigDecimal sumFor(@Param("shopId") Long shopId, @Param("statuses") Collection<PayoutStatus> statuses);

	@Query("select coalesce(sum(p.amount), 0) from Payout p where p.status = :status")
	BigDecimal sumByStatus(@Param("status") PayoutStatus status);
}
