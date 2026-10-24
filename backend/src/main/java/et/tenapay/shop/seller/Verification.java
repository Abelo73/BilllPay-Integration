package et.tenapay.shop.seller;

import java.time.Instant;

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

/** One verification request of a shop: private ID photos and the staff decision. The latest one counts. */
@Entity
@Table(name = "verifications")
@Getter
@Setter
@NoArgsConstructor
public class Verification {

	public enum IdType { FAYDA, KEBELE, PASSPORT, DRIVING_LICENCE }

	/** The photos a request can hold; ID front and selfie are required to send it. */
	public enum Photo { ID_FRONT, ID_BACK, SELFIE, LICENCE }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long shopId;

	@Enumerated(EnumType.STRING)
	private IdType idType = IdType.FAYDA;

	private String idFrontKey;

	private String idBackKey;

	private String selfieKey;

	private String licenceKey;

	private String details;

	@Enumerated(EnumType.STRING)
	private VerificationStatus status = VerificationStatus.DRAFT;

	private String staffNote;

	private Instant submittedAt;

	private Instant decidedAt;

	private String decidedBy;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	public String key(Photo p) {
		return switch (p) {
			case ID_FRONT -> idFrontKey;
			case ID_BACK -> idBackKey;
			case SELFIE -> selfieKey;
			case LICENCE -> licenceKey;
		};
	}

	public void setKey(Photo p, String key) {
		switch (p) {
			case ID_FRONT -> idFrontKey = key;
			case ID_BACK -> idBackKey = key;
			case SELFIE -> selfieKey = key;
			case LICENCE -> licenceKey = key;
		}
	}
}
