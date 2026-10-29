package et.tenapay.shop.refund;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "refunds")
@Getter
@Setter
@NoArgsConstructor
public class Refund {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	private UUID orderId;

	private UUID paymentAttemptId;

	private String merchantReference;

	private UUID idempotencyKey;

	private String billpayRefundId;

	private BigDecimal amount;

	private String currency;

	private String reason;

	@Enumerated(EnumType.STRING)
	private RefundStatus status;

	private String reasonCode;

	private boolean external;

	private String requestPayload;

	private String responsePayload;

	private String error;

	/** Calls made to BillPay so far (each one is a {@link RefundAttempt}). */
	private int attempts = 1;

	/** When the retry job sends it again; null = it doesn't. */
	private Instant nextTryAt;

	/** Plain words for staff on why it waits for them. */
	private String needsStaffWhy;

	/** Bank transfer or receipt number when staff paid it another way. */
	private String manualReference;

	private String staffNote;

	/** Staff member who paid it by hand or cancelled it. */
	private String handledBy;

	/** When staff were told it is stuck in review (once). */
	private Instant stuckAlertedAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;
}
