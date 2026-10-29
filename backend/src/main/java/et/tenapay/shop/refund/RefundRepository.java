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

	/** Waiting refunds whose next try is due, oldest wait first. */
	@Query("select r.id from Refund r where r.nextTryAt is not null and r.nextTryAt <= :now order by r.nextTryAt")
	List<UUID> findDueForRetry(@Param("now") java.time.Instant now, Pageable pageable);

	/** In review at BillPay since before {@code before} and not flagged yet. */
	@Query("select r.id from Refund r where r.status = :status and r.updatedAt < :before and r.stuckAlertedAt is null")
	List<UUID> findStuck(@Param("status") RefundStatus status, @Param("before") java.time.Instant before);

	/**
	 * What staff should look at: waiting for them, flagged as stuck in review, or saved but never sent (a crash
	 * between saving and calling BillPay).
	 */
	@Query("""
			select r from Refund r where r.status = et.tenapay.shop.refund.RefundStatus.NEEDS_STAFF
			  or (r.status = et.tenapay.shop.refund.RefundStatus.PENDING and r.stuckAlertedAt is not null)
			  or (r.status = et.tenapay.shop.refund.RefundStatus.REQUESTED and r.createdAt < :sentBy)
			order by r.createdAt""")
	List<Refund> findNeedingStaff(@Param("sentBy") java.time.Instant sentBy);
}
