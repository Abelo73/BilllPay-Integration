package et.tenapay.shop.review;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import et.tenapay.shop.order.OrderItem;

interface ReviewRepository extends JpaRepository<Review, Long> {

	boolean existsByOrderItemId(Long orderItemId);

	Page<Review> findByProductIdAndHiddenFalseOrderByCreatedAtDesc(Long productId, Pageable page);

	Page<Review> findByShopIdAndHiddenFalseOrderByCreatedAtDesc(Long shopId, Pageable page);

	Page<Review> findByShopIdOrderByCreatedAtDesc(Long shopId, Pageable page);

	Page<Review> findByHiddenOrderByCreatedAtDesc(boolean hidden, Pageable page);

	Page<Review> findAllByOrderByCreatedAtDesc(Pageable page);

	/** [rating, count] of visible reviews of a product. */
	@Query("select r.rating, count(r) from Review r where r.productId = :id and r.hidden = false group by r.rating")
	List<Object[]> productStars(@Param("id") Long productId);

	/** [rating, count] of visible reviews of a shop. */
	@Query("select r.rating, count(r) from Review r where r.shopId = :id and r.hidden = false group by r.rating")
	List<Object[]> shopStars(@Param("id") Long shopId);

	/** [productId, average, count] for many products at once (product cards). */
	@Query("select r.productId, avg(r.rating), count(r) from Review r where r.productId in :ids and r.hidden = false group by r.productId")
	List<Object[]> productAverages(@Param("ids") List<Long> productIds);

	@Query("select i from OrderItem i join fetch i.order where i.id = :id")
	java.util.Optional<OrderItem> orderItem(@Param("id") Long orderItemId);

	/** Items the customer received and has not reviewed yet, newest delivery first. */
	@Query("""
			select i from OrderItem i join i.order o
			where o.userId = :userId
			  and o.fulfilmentStatus = et.tenapay.shop.order.FulfilmentStatus.DELIVERED
			  and o.status in (et.tenapay.shop.order.OrderStatus.PAID, et.tenapay.shop.order.OrderStatus.PARTIALLY_REFUNDED)
			  and not exists (select 1 from Review r where r.orderItemId = i.id)
			order by o.deliveredAt desc
			""")
	List<OrderItem> reviewable(@Param("userId") UUID userId, Pageable page);
}
