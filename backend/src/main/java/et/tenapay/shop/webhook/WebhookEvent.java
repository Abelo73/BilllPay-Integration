package et.tenapay.shop.webhook;

import java.time.Instant;

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

/** Inbox row: every BillPay callback is stored here before anything else happens. */
@Entity
@Table(name = "billpay_webhook_events")
@Getter
@Setter
@NoArgsConstructor
public class WebhookEvent {

	public enum Status { RECEIVED, PUBLISHED, PROCESSED, DUPLICATE, IGNORED, REJECTED, FAILED }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String billpayEventId;

	private String billpayPaymentId;

	private String merchantReference;

	private String eventType;

	private String reportedStatus;

	private String headers;

	private String payload;

	private Boolean signatureValid;

	private String signatureScheme;

	/** Whose secret verified the signature; null when it wasn't verified. */
	@Enumerated(EnumType.STRING)
	private et.tenapay.shop.payment.billpay.BillPayEnvironment environment;

	@Enumerated(EnumType.STRING)
	private Status status;

	private String error;

	@Column(updatable = false)
	private Instant receivedAt = Instant.now();

	private Instant processedAt;
}
