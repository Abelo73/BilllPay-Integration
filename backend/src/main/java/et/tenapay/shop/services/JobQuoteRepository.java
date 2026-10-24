package et.tenapay.shop.services;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface JobQuoteRepository extends JpaRepository<JobQuote, Long> {

	List<JobQuote> findByJobIdOrderByCreatedAtAsc(Long jobId);

	Page<JobQuote> findByProIdOrderByCreatedAtDesc(Long proId, Pageable page);

	boolean existsByJobIdAndProId(Long jobId, Long proId);

	long countByJobId(Long jobId);
}
