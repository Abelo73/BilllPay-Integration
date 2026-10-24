package et.tenapay.shop.inbox;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface InboxRepository extends JpaRepository<InboxItem, Long> {

	Page<InboxItem> findByUserIdOrderByCreatedAtDescIdDesc(UUID userId, Pageable page);

	long countByUserIdAndReadAtIsNull(UUID userId);

	boolean existsByDedupeKey(String dedupeKey);

	@Modifying
	@Query("update InboxItem i set i.readAt = :now where i.userId = :userId and i.readAt is null")
	int markAllRead(@Param("userId") UUID userId, @Param("now") Instant now);

	@Modifying
	@Query("update InboxItem i set i.readAt = :now where i.userId = :userId and i.id = :id and i.readAt is null")
	int markRead(@Param("userId") UUID userId, @Param("id") Long id, @Param("now") Instant now);

	@Modifying
	@Query("delete from InboxItem i where i.createdAt < :before")
	int deleteOlderThan(@Param("before") Instant before);
}
