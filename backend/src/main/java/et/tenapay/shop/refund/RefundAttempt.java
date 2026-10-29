package et.tenapay.shop.refund;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One call to BillPay for a refund, and what came back. */
@Entity
@Table(name = "refund_attempts")
@Getter
@Setter
@NoArgsConstructor
public class RefundAttempt {

	public enum Outcome {
		ACCEPTED, REFUSED, NO_ANSWER
	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	private UUID refundId;

	private int attemptNo;

	private UUID idempotencyKey;

	@Enumerated(EnumType.STRING)
	private Outcome outcome;

	private Integer httpStatus;

	private String reasonCode;

	private String error;

	private String responsePayload;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
