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

interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

	@Query("select m from ChatMessage m where m.conversationId = :cid and m.id > :after order by m.id asc")
	List<ChatMessage> after(@Param("cid") Long conversationId, @Param("after") long after, Pageable page);

	@Query("select m from ChatMessage m where m.conversationId = :cid order by m.id desc")
	List<ChatMessage> latest(@Param("cid") Long conversationId, Pageable page);

	long countBySenderIdAndCreatedAtAfter(UUID senderId, Instant after);
}
