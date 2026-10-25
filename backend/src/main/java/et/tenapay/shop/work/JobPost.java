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

/** J3: a job post. Staff check it before it goes live. */
@Entity
@Table(name = "job_posts")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class JobPost {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	public enum Type { FULL_TIME, PART_TIME, INTERNSHIP, CONTRACT }

	public enum Status { PENDING, LIVE, REJECTED, CLOSED }

	private UUID employerId;

	private String employerName;

	private String title;

	private String place;

	@Enumerated(EnumType.STRING)
	@Column(name = "job_type")
	private Type type;

	private String field;

	private BigDecimal salaryMin;

	private BigDecimal salaryMax;

	private String salaryNote;

	private String description;

	private String requirements;

	private LocalDate deadline;

	@Enumerated(EnumType.STRING)
	private Status status = Status.PENDING;

	private String statusNote;

	/** 0 = free post. */
	private BigDecimal fee = BigDecimal.ZERO;

	private boolean feePaid = true;

	private boolean featured;

	private String decidedBy;

	private Instant decidedAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	public boolean open() {
		return status == Status.LIVE && !deadline.isBefore(LocalDate.now(java.time.ZoneId.of("Africa/Addis_Ababa")));
	}
}
