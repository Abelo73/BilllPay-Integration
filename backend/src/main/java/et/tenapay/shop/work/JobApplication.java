package et.tenapay.shop.work;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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

/** J4: an application to a job, with the CV it was sent with. */
@Entity
@Table(name = "job_applications")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class JobApplication {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	public enum CvKind { AUTO, FILE }

	public enum Status { NEW, SHORTLISTED, INTERVIEW, HIRED, NOT_SELECTED }

	private Long jobId;

	private Long profileId;

	private UUID userId;

	@Enumerated(EnumType.STRING)
	private CvKind cvKind;

	private Long cvFileId;

	private String message;

	@Enumerated(EnumType.STRING)
	private Status status = Status.NEW;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;
}
