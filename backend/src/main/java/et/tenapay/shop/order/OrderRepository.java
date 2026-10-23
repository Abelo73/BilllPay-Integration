package et.tenapay.shop.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface OrderRepository extends JpaRepository<Order, UUID> {

	@EntityGraph(attributePaths = "items")
	Optional<Order> findByOrderNumber(String orderNumber);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from Order o where o.id = :id")
	Optional<Order> lockById(@Param("id") UUID id);

	@Query("select o.id from Order o where o.status in :statuses and o.createdAt < :before")
	List<UUID> findIdsByStatusInAndCreatedAtBefore(@Param("statuses") Collection<OrderStatus> statuses,
			@Param("before") Instant before);

	@Query("""
			select o from Order o
			where (:status is null or o.status = :status)
			  and (:fulfilment is null or o.fulfilmentStatus = :fulfilment)
			  and (:q is null or o.orderNumber like concat('%', cast(:q as string), '%')
			       or lower(o.customerName) like lower(concat('%', cast(:q as string), '%'))
			       or o.customerPhone like concat('%', cast(:q as string), '%'))
			""")
	Page<Order> adminSearch(@Param("status") OrderStatus status, @Param("fulfilment") FulfilmentStatus fulfilment,
			@Param("q") String q, Pageable pageable);

	Page<Order> findByUserId(UUID userId, Pageable pageable);

	long countByStatus(OrderStatus status);

	@Query("select coalesce(sum(o.total), 0) from Order o where o.status in :statuses")
	BigDecimal sumTotalByStatusIn(@Param("statuses") Collection<OrderStatus> statuses);

	@Query(value = "select nextval('order_number_seq')", nativeQuery = true)
	long nextOrderSequence();
}
