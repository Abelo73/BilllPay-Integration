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

interface ChatReportRepository extends JpaRepository<ChatReport, Long> {

	Page<ChatReport> findByStatusOrderByCreatedAtDesc(ChatReport.Status status, Pageable page);

	Page<ChatReport> findAllByOrderByCreatedAtDesc(Pageable page);

	boolean existsByConversationIdAndReporterIdAndStatus(Long conversationId, UUID reporterId, ChatReport.Status status);

	long countByStatus(ChatReport.Status status);
}
