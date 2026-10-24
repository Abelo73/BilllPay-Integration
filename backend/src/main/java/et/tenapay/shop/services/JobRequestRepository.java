package et.tenapay.shop.services;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

interface JobRequestRepository extends JpaRepository<JobRequest, Long> {

	Page<JobRequest> findByCustomerIdOrderByCreatedAtDesc(UUID customerId, Pageable page);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select j from JobRequest j where j.id = :id")
	Optional<JobRequest> lockById(@Param("id") Long id);

	/** Open jobs a pro can quote on: their trade (or asked directly), not their own, not yet quoted by them. */
	@Query("""
			select j from JobRequest j
			where j.status = et.tenapay.shop.services.JobRequest.Status.OPEN and j.expiresAt > :now
			  and j.customerId <> :ownerId
			  and ((j.directProId is null and j.trade = :trade) or j.directProId = :proId)
			  and not exists (select 1 from JobQuote q where q.jobId = j.id and q.proId = :proId)
			order by j.createdAt desc
			""")
	Page<JobRequest> openFor(@Param("proId") Long proId, @Param("ownerId") UUID ownerId,
			@Param("trade") ProProfile.Trade trade, @Param("now") Instant now, Pageable page);

	long countByCustomerIdAndCreatedAtAfter(UUID customerId, Instant after);
}
