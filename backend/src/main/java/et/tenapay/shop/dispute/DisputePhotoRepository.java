package et.tenapay.shop.dispute;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputePhotoRepository extends JpaRepository<DisputePhoto, Long> {

	List<DisputePhoto> findByDisputeIdOrderByIdAsc(Long disputeId);

	long countByDisputeId(Long disputeId);
}
