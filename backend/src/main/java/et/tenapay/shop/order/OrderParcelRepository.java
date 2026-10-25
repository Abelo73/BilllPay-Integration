package et.tenapay.shop.order;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface OrderParcelRepository extends JpaRepository<OrderParcel, Long> {

	List<OrderParcel> findByOrderIdOrderByParcelNoAsc(UUID orderId);

	List<OrderParcel> findByOrderIdInOrderByParcelNoAsc(java.util.Collection<UUID> orderIds);

	Optional<OrderParcel> findByOrderIdAndShopId(UUID orderId, Long shopId);

	/** A seller's parcels of paid orders (current BillPay environment), by delivery status, optional search. */
	@Query(value = """
			select p from OrderParcel p, Order o
			where o.id = p.orderId and p.shopId = :shopId and o.paidAt is not null and o.environment = :environment
			  and p.fulfilmentStatus in :fulfilment
			  and (:q is null or o.orderNumber like concat('%', cast(:q as string), '%')
			       or lower(o.customerName) like lower(concat('%', cast(:q as string), '%')))
			""", countQuery = """
			select count(p) from OrderParcel p, Order o
			where o.id = p.orderId and p.shopId = :shopId and o.paidAt is not null and o.environment = :environment
			  and p.fulfilmentStatus in :fulfilment
			  and (:q is null or o.orderNumber like concat('%', cast(:q as string), '%')
			       or lower(o.customerName) like lower(concat('%', cast(:q as string), '%')))
			""")
	org.springframework.data.domain.Page<OrderParcel> findForShop(@Param("shopId") Long shopId,
			@Param("environment") et.tenapay.shop.payment.billpay.BillPayEnvironment environment,
			@Param("fulfilment") java.util.Collection<FulfilmentStatus> fulfilment, @Param("q") String q,
			org.springframework.data.domain.Pageable pageable);

	@Query("""
			select count(p) from OrderParcel p, Order o
			where o.id = p.orderId and p.shopId = :shopId and o.paidAt is not null and o.environment = :environment
			  and p.fulfilmentStatus in :fulfilment
			""")
	long countForShop(@Param("shopId") Long shopId,
			@Param("environment") et.tenapay.shop.payment.billpay.BillPayEnvironment environment,
			@Param("fulfilment") java.util.Collection<FulfilmentStatus> fulfilment);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from OrderParcel p where p.orderId = :orderId order by p.parcelNo")
	List<OrderParcel> lockByOrderId(@Param("orderId") UUID orderId);
}
