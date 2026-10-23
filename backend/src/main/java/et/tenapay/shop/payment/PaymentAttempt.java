package et.tenapay.shop.payment;

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

/** One call to BillPay "create payment" for an order. */
@Entity
@Table(name = "payment_attempts")
@Getter
@Setter
@NoArgsConstructor
public class PaymentAttempt {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	private UUID orderId;

	private int attemptNo;

	private String merchantReference;

	private UUID idempotencyKey;

	private String billpayPaymentId;

	private String checkoutUrl;

	@Enumerated(EnumType.STRING)
	private PaymentStatus status;

	private BigDecimal amount;

	private String currency;

	private String paymentMethod;

	private String reasonCode;

	private String requestPayload;

	private String responsePayload;

	private String error;

	private Instant expiresAt;

	private Instant lastCheckedAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;
}
