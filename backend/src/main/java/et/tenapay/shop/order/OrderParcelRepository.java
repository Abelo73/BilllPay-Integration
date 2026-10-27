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
			where o.id = p.orderId and p.shopId = :shopId and (o.paidAt is not null or o.paymentMethod = et.tenapay.shop.order.PaymentMethod.CASH) and o.environment = :environment
			  and p.fulfilmentStatus in :fulfilment
			  and (:q is null or o.orderNumber like concat('%', cast(:q as string), '%')
			       or lower(o.customerName) like lower(concat('%', cast(:q as string), '%')))
			""", countQuery = """
			select count(p) from OrderParcel p, Order o
			where o.id = p.orderId and p.shopId = :shopId and (o.paidAt is not null or o.paymentMethod = et.tenapay.shop.order.PaymentMethod.CASH) and o.environment = :environment
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
			where o.id = p.orderId and p.shopId = :shopId and (o.paidAt is not null or o.paymentMethod = et.tenapay.shop.order.PaymentMethod.CASH) and o.environment = :environment
			  and p.fulfilmentStatus in :fulfilment
			""")
	long countForShop(@Param("shopId") Long shopId,
			@Param("environment") et.tenapay.shop.payment.billpay.BillPayEnvironment environment,
			@Param("fulfilment") java.util.Collection<FulfilmentStatus> fulfilment);

	// ---------- seller money (M6) ----------

	@Query("select coalesce(sum(p.sellerAmount), 0) from OrderParcel p where p.shopId = :shopId and p.payoutStatus = :status")
	java.math.BigDecimal sumEarnings(@Param("shopId") Long shopId, @Param("status") et.tenapay.shop.payout.EarningStatus status);

	/** Delivered parcels whose money is still held after the buyer's window to complain. */
	@Query("""
			select p from OrderParcel p
			where p.payoutStatus = et.tenapay.shop.payout.EarningStatus.HELD
			  and p.fulfilmentStatus = et.tenapay.shop.order.FulfilmentStatus.DELIVERED and p.deliveredAt < :before
			""")
	List<OrderParcel> dueForRelease(@Param("before") java.time.Instant before);

	/** A seller's statement: every paid parcel, newest first. */
	org.springframework.data.domain.Page<OrderParcel> findByShopIdAndPayoutStatusIsNotNull(Long shopId,
			org.springframework.data.domain.Pageable pageable);

	/** [held, released] money of all sellers, and [commission earned] on parcels not cancelled. */
	@Query("""
			select coalesce(sum(case when p.payoutStatus = et.tenapay.shop.payout.EarningStatus.HELD then p.sellerAmount else 0 end), 0),
			       coalesce(sum(case when p.payoutStatus = et.tenapay.shop.payout.EarningStatus.RELEASED then p.sellerAmount else 0 end), 0),
			       coalesce(sum(case when p.payoutStatus <> et.tenapay.shop.payout.EarningStatus.CANCELLED then p.commissionAmount else 0 end), 0)
			from OrderParcel p where p.payoutStatus is not null
			""")
	List<Object[]> platformTotals();

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from OrderParcel p where p.orderId = :orderId order by p.parcelNo")
	List<OrderParcel> lockByOrderId(@Param("orderId") UUID orderId);
}
