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

interface ChatOfferRepository extends JpaRepository<ChatOffer, Long> {

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from ChatOffer o where o.id = :id")
	Optional<ChatOffer> lockById(@Param("id") Long id);

	List<ChatOffer> findByConversationIdAndStatus(Long conversationId, ChatOffer.Status status);

	List<ChatOffer> findByIdIn(List<Long> ids);
}
