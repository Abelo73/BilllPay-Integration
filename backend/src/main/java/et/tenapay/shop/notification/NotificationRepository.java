package et.tenapay.shop.notification;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

	boolean existsByDedupeKey(String dedupeKey);

	List<Notification> findByOrderNumberOrderByCreatedAtAsc(String orderNumber);

	Page<Notification> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
