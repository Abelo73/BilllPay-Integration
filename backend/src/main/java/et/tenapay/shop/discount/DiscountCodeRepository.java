package et.tenapay.shop.discount;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface DiscountCodeRepository extends JpaRepository<DiscountCode, Long> {

	Optional<DiscountCode> findByCode(String code);

	/** Locks the row so two checkouts can't both take the last use. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select d from DiscountCode d where d.code = :code")
	Optional<DiscountCode> lockByCode(@Param("code") String code);

	boolean existsByCode(String code);

	List<DiscountCode> findAllByOrderByCreatedAtDesc();
}
