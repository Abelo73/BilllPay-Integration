package et.tenapay.shop.user;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoginEventRepository extends JpaRepository<LoginEvent, Long> {

	Page<LoginEvent> findByUserId(UUID userId, Pageable pageable);
}
