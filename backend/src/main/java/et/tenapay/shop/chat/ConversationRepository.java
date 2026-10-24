package et.tenapay.shop.chat;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

interface ConversationRepository extends JpaRepository<Conversation, Long> {

	Optional<Conversation> findByBuyerIdAndShopId(UUID buyerId, Long shopId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Conversation c where c.id = :id")
	Optional<Conversation> lockById(@Param("id") Long id);

	/** As buyer, as the owner of a shop, or both. */
	@Query("""
		select c from Conversation c
		where (:asBuyer = true and c.buyerId = :userId) or (:shopId is not null and c.shopId = :shopId)
		order by c.lastMessageAt desc
		""")
	Page<Conversation> forUser(@Param("userId") UUID userId, @Param("asBuyer") boolean asBuyer,
		@Param("shopId") Long shopId, Pageable page);

	@Query("""
		select count(c) from Conversation c
		where (c.buyerId = :userId and (c.buyerLastReadAt is null or c.buyerLastReadAt < c.lastMessageAt))
		   or (:shopId is not null and c.shopId = :shopId
		       and (c.sellerLastReadAt is null or c.sellerLastReadAt < c.lastMessageAt))
		""")
	long countUnread(@Param("userId") UUID userId, @Param("shopId") Long shopId);
}
