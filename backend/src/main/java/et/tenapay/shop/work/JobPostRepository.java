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
public interface JobPostRepository extends JpaRepository<JobPost, Long> {

	/** The public jobs list: live, deadline not passed, featured first. */
	@Query("""
			select j from JobPost j
			where j.status = et.tenapay.shop.work.JobPost.Status.LIVE and j.deadline >= :today
			  and (:type is null or j.type = :type)
			  and (:q is null or lower(j.title) like lower(concat('%', cast(:q as string), '%'))
			       or lower(j.field) like lower(concat('%', cast(:q as string), '%'))
			       or lower(j.employerName) like lower(concat('%', cast(:q as string), '%')))
			  and (:place is null or lower(j.place) like lower(concat('%', cast(:place as string), '%')))
			order by j.featured desc, j.createdAt desc
			""")
	Page<JobPost> searchLive(@Param("today") java.time.LocalDate today, @Param("type") JobPost.Type type,
			@Param("q") String q, @Param("place") String place, Pageable pageable);

	List<JobPost> findByEmployerIdOrderByCreatedAtDesc(UUID employerId);

	long countByEmployerId(UUID employerId);

	Page<JobPost> findByStatus(JobPost.Status status, Pageable pageable);

	long countByStatus(JobPost.Status status);
}
