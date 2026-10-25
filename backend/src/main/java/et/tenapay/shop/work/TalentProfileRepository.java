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
public interface TalentProfileRepository extends JpaRepository<TalentProfile, Long> {

	Optional<TalentProfile> findByUserId(UUID userId);

	/** Employers' talent search: public profiles only, featured first. */
	@Query("""
			select t from TalentProfile t
			where t.publicProfile = true
			  and (:q is null or lower(t.skills) like lower(concat('%', cast(:q as string), '%'))
			       or lower(t.fieldOfStudy) like lower(concat('%', cast(:q as string), '%'))
			       or lower(t.headline) like lower(concat('%', cast(:q as string), '%')))
			order by case when t.featuredUntil > current_timestamp then 0 else 1 end, t.updatedAt desc
			""")
	Page<TalentProfile> searchPublic(@Param("q") String q, Pageable pageable);

	Page<TalentProfile> findByStudentStatus(TalentProfile.StudentStatus status, Pageable pageable);

	long countByStudentStatus(TalentProfile.StudentStatus status);
}
