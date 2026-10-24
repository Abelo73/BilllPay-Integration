package et.tenapay.shop.services;

import java.math.BigDecimal;
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

/** A pro's price for a job (design S10). */
@Entity
@Table(name = "job_quotes")
@Getter
@Setter
@NoArgsConstructor
public class JobQuote {

	public enum Status { SENT, ACCEPTED, DECLINED, WITHDRAWN }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long jobId;

	private Long proId;

	private BigDecimal price;

	private String message;

	private String available;

	@Enumerated(EnumType.STRING)
	private Status status = Status.SENT;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
