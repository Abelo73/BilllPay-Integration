package et.tenapay.shop.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerAddressRepository extends JpaRepository<CustomerAddress, Long> {

	List<CustomerAddress> findByUserIdOrderByDefaultAddressDescCreatedAtAsc(UUID userId);

	Optional<CustomerAddress> findByIdAndUserId(Long id, UUID userId);

	long countByUserId(UUID userId);

	@Modifying
	@Query("update CustomerAddress a set a.defaultAddress = false where a.userId = :userId and a.id <> :keepId")
	void clearDefaultExcept(@Param("userId") UUID userId, @Param("keepId") Long keepId);
}
