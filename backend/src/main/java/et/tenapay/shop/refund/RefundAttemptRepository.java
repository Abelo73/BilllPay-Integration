package et.tenapay.shop.refund;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RefundAttemptRepository extends JpaRepository<RefundAttempt, UUID> {

	List<RefundAttempt> findByRefundIdOrderByAttemptNoAsc(UUID refundId);
}
