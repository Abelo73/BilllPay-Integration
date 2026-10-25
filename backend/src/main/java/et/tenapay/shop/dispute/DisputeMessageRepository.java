package et.tenapay.shop.dispute;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeMessageRepository extends JpaRepository<DisputeMessage, Long> {

	List<DisputeMessage> findByDisputeIdOrderByIdAsc(Long disputeId);
}
