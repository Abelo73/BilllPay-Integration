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

/** A private file of a profile (certificate, uploaded CV, student ID, professional CV). */
@Entity
@Table(name = "talent_files")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class TalentFile {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	public enum Kind { CERTIFICATE, CV_UPLOAD, CV_PRO, STUDENT_ID }

	private Long profileId;

	@Enumerated(EnumType.STRING)
	private Kind kind;

	private String storageKey;

	private String fileName;

	private String contentType;

	private int sizeBytes;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
