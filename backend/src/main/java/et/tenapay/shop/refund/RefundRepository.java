package et.tenapay.shop.refund;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

	List<Refund> findByOrderIdOrderByCreatedAtAsc(UUID orderId);

	List<Refund> findByPaymentAttemptIdOrderByCreatedAtAsc(UUID paymentAttemptId);

	Optional<Refund> findByBillpayRefundId(String billpayRefundId);

	Optional<Refund> findByMerchantReference(String merchantReference);

	Optional<Refund> findFirstByPaymentAttemptIdAndStatusInOrderByCreatedAtDesc(UUID paymentAttemptId,
			Collection<RefundStatus> statuses);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from Refund r where r.id = :id")
	Optional<Refund> lockById(@Param("id") UUID id);

	long countByOrderId(UUID orderId);

	Page<Refund> findByStatus(RefundStatus status, Pageable pageable);
}
