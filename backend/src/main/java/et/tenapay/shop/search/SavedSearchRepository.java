package et.tenapay.shop.search;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SavedSearchRepository extends JpaRepository<SavedSearch, Long> {

	List<SavedSearch> findByUserIdOrderByIdDesc(UUID userId);

	long countByUserId(UUID userId);

	@Query("select s from SavedSearch s where s.alertInbox = true or s.alertSms = true order by s.id")
	List<SavedSearch> withAlerts();
}
