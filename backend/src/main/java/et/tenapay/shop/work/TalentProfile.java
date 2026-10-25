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

/** J1: a job seeker's profile. Private by default; the phone is never shown publicly. */
@Entity
@Table(name = "talent_profiles")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class TalentProfile {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	public enum Status { STUDENT, GRADUATE, LOOKING, WORKING_OPEN }

	public enum StudentStatus { NONE, SUBMITTED, APPROVED, REJECTED }

	private UUID userId;

	private String fullName;

	@Enumerated(EnumType.STRING)
	private Status status;

	private String headline;

	private String about;

	private String school;

	private String fieldOfStudy;

	private Integer graduationYear;

	/** Comma separated. */
	private String skills;

	/** Comma separated. */
	private String languages;

	/** Comma separated: FULL_TIME, PART_TIME, INTERNSHIP, WEEKEND. */
	private String workTypes;

	/** Comma separated: SODO, NEARBY, REMOTE. */
	private String workPlaces;

	private String photoKey;

	private boolean publicProfile;

	@Enumerated(EnumType.STRING)
	private StudentStatus studentStatus = StudentStatus.NONE;

	private String studentNote;

	private Instant studentVerifiedAt;

	private Instant featuredUntil;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;
}
