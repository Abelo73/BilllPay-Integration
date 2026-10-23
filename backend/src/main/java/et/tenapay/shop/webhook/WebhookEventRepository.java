package et.tenapay.shop.webhook;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WebhookEventRepository extends JpaRepository<WebhookEvent, Long> {

	boolean existsByBillpayEventId(String billpayEventId);

	@Query("select e.id from WebhookEvent e where e.status = 'RECEIVED' and e.receivedAt < :before order by e.id")
	List<Long> findStuckReceived(@Param("before") Instant before, Pageable pageable);

	@Query("""
			select e from WebhookEvent e
			where (:paymentId is not null and e.billpayPaymentId = :paymentId)
			   or (:reference is not null and e.merchantReference = :reference)
			order by e.receivedAt
			""")
	List<WebhookEvent> findForPayment(@Param("paymentId") String paymentId, @Param("reference") String reference);

	Page<WebhookEvent> findByStatus(WebhookEvent.Status status, Pageable pageable);
}
