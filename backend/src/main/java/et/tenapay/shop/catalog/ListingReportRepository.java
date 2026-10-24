package et.tenapay.shop.catalog;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ListingReportRepository extends JpaRepository<ListingReport, Long> {

	boolean existsByProductIdAndReporterId(Long productId, UUID reporterId);

	List<ListingReport> findByProductIdAndStatus(Long productId, ListingReport.Status status);

	/** Products with reports in {@code statuses}: [productId, report count, latest report time], most reported first. */
	@Query("""
			select r.productId, count(r), max(r.createdAt) from ListingReport r
			where r.status in :statuses group by r.productId order by count(r) desc, max(r.createdAt) desc
			""")
	Page<Object[]> groupedByProduct(@Param("statuses") Collection<ListingReport.Status> statuses, Pageable pageable);

	long countByStatus(ListingReport.Status status);

	@Modifying(flushAutomatically = true)
	@Query("""
			update ListingReport r set r.status = :to, r.decidedAt = current_timestamp, r.decidedBy = :by
			where r.productId = :productId and r.status = et.tenapay.shop.catalog.ListingReport.Status.OPEN
			""")
	int closeOpen(@Param("productId") Long productId, @Param("to") ListingReport.Status to, @Param("by") String by);
}
