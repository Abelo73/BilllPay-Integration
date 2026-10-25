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
public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {

	boolean existsByJobIdAndUserId(Long jobId, UUID userId);

	List<JobApplication> findByUserIdOrderByCreatedAtDesc(UUID userId);

	List<JobApplication> findByJobIdOrderByCreatedAtDesc(Long jobId);

	long countByJobId(Long jobId);

	@Query("select count(a) from JobApplication a where a.userId = :userId and a.createdAt > :since")
	long countSince(@Param("userId") UUID userId, @Param("since") java.time.Instant since);

	/** Employers may see a profile (and its phone) once the person applied to one of their jobs. */
	@Query("""
			select count(a) > 0 from JobApplication a, JobPost j
			where a.jobId = j.id and j.employerId = :employerId and a.profileId = :profileId
			""")
	boolean appliedToEmployer(@Param("employerId") UUID employerId, @Param("profileId") Long profileId);
}
