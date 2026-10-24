package et.tenapay.shop.order;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

	List<OrderEvent> findByOrderIdOrderByCreatedAtAscIdAsc(UUID orderId);

	boolean existsByOrderIdAndType(UUID orderId, String type);
}
