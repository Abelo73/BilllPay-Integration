package et.tenapay.shop.sms;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SmsMessageRepository extends JpaRepository<SmsMessage, Long> {

	java.util.List<SmsMessage> findByOrderNumberOrderByCreatedAtAsc(String orderNumber);

	@Query("""
			select m from SmsMessage m
			where (:status is null or m.status = :status)
			  and (:q is null or m.recipient like concat('%', cast(:q as string), '%')
			       or m.orderNumber like concat('%', cast(:q as string), '%'))
			order by m.createdAt desc, m.id desc
			""")
	Page<SmsMessage> search(@Param("status") SmsMessage.Status status, @Param("q") String q, Pageable pageable);
}
