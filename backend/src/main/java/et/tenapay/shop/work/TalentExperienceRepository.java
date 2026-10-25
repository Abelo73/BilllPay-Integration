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
public interface TalentExperienceRepository extends JpaRepository<TalentExperience, Long> {

	List<TalentExperience> findByProfileIdOrderByPositionAsc(Long profileId);

	void deleteByProfileId(Long profileId);
}
