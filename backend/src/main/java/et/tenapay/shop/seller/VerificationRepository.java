package et.tenapay.shop.seller;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationRepository extends JpaRepository<Verification, Long> {

	Optional<Verification> findFirstByShopIdOrderByIdDesc(Long shopId);

	Page<Verification> findByStatus(VerificationStatus status, Pageable pageable);

	long countByStatus(VerificationStatus status);
}
