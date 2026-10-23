package et.tenapay.shop.payment;

import java.time.Instant;
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

public interface PaymentAttemptRepository extends JpaRepository<PaymentAttempt, UUID> {

	List<PaymentAttempt> findByOrderIdOrderByAttemptNoAsc(UUID orderId);

	Optional<PaymentAttempt> findFirstByOrderIdOrderByAttemptNoDesc(UUID orderId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from PaymentAttempt a where a.id = :id")
	Optional<PaymentAttempt> lockById(@Param("id") UUID id);

	Optional<PaymentAttempt> findByBillpayPaymentId(String billpayPaymentId);

	Optional<PaymentAttempt> findByMerchantReference(String merchantReference);

	@Query("""
			select a.id from PaymentAttempt a
			where a.status in :statuses and a.createdAt < :createdBefore
			  and (a.lastCheckedAt is null or a.lastCheckedAt < :checkedBefore)
			order by a.createdAt
			""")
	List<UUID> findDueForReconciliation(@Param("statuses") Collection<PaymentStatus> statuses,
			@Param("createdBefore") Instant createdBefore, @Param("checkedBefore") Instant checkedBefore,
			Pageable pageable);

	Page<PaymentAttempt> findByStatus(PaymentStatus status, Pageable pageable);

	long countByStatus(PaymentStatus status);

	@Query("select a.reasonCode, count(a) from PaymentAttempt a where a.status = 'FAILED' group by a.reasonCode")
	List<Object[]> countFailuresByReason();
}
