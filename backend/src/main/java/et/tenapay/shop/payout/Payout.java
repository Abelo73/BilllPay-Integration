package et.tenapay.shop.payout;

import java.math.BigDecimal;
import java.time.Instant;

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

/** A seller's request to withdraw available money, and how staff sent it. Account details are copied at request time. */
@Entity
@Table(name = "payouts")
@Getter
@Setter
@NoArgsConstructor
public class Payout {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long shopId;

	private BigDecimal amount;

	@Enumerated(EnumType.STRING)
	private PayoutStatus status = PayoutStatus.REQUESTED;

	private String method;

	private String provider;

	private String accountName;

	private String account;

	/** Transfer reference from the bank or wallet. */
	private String reference;

	private String note;

	private String requestedBy;

	private String decidedBy;

	private Instant requestedAt = Instant.now();

	private Instant decidedAt;

	@Version
	private Integer version;
}
