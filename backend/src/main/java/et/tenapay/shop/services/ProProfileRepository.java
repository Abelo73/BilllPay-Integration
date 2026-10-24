package et.tenapay.shop.services;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ProProfileRepository extends JpaRepository<ProProfile, Long> {

	Optional<ProProfile> findByOwnerId(UUID ownerId);

	/** Approved pros, best rated and most experienced on the platform first. */
	@Query("""
			select p from ProProfile p
			where p.status = et.tenapay.shop.services.ProProfile.Status.APPROVED
			  and (:trade is null or p.trade = :trade)
			  and (:q is null or lower(p.displayName) like lower(concat('%', cast(:q as string), '%'))
			       or lower(p.headline) like lower(concat('%', cast(:q as string), '%'))
			       or lower(p.areas) like lower(concat('%', cast(:q as string), '%')))
			order by (case when p.ratingCount = 0 then 0 else (p.ratingSum * 1.0 / p.ratingCount) end) desc, p.jobsDone desc, p.createdAt
			""")
	Page<ProProfile> search(@Param("trade") ProProfile.Trade trade, @Param("q") String q, Pageable page);

	@Query("select p from ProProfile p where (:status is null or p.status = :status) order by p.createdAt desc")
	Page<ProProfile> adminList(@Param("status") ProProfile.Status status, Pageable page);
}
