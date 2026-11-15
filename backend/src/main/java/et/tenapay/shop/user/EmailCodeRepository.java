package et.tenapay.shop.user;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface EmailCodeRepository extends JpaRepository<EmailCode, Long> {

	long countByEmailAndCreatedAtAfter(String email, Instant after);

	long countByIpAndCreatedAtAfter(String ip, Instant after);

	Optional<EmailCode> findFirstByEmailOrderByCreatedAtDesc(String email);

	/** The newest code that can still be used, locked so two tries can't both use it. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from EmailCode c where c.email = :email and c.usedAt is null and c.expiresAt > :now order by c.createdAt desc")
	List<EmailCode> lockActive(@Param("email") String email, @Param("now") Instant now, Pageable page);

	/** A new code replaces every older one. */
	@Modifying
	@Query("update EmailCode c set c.usedAt = :now where c.email = :email and c.usedAt is null")
	int retireAll(@Param("email") String email, @Param("now") Instant now);
}
