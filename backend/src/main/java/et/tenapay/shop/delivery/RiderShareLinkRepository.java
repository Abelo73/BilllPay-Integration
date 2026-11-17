package et.tenapay.shop.delivery;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RiderShareLinkRepository extends JpaRepository<RiderShareLink, Long> {

	Optional<RiderShareLink> findByTokenHash(String tokenHash);
}
