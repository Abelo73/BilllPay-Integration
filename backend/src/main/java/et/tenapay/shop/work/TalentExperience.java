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

/** One job or role on a profile. */
@Entity
@Table(name = "talent_experience")
@Getter
@Setter
@NoArgsConstructor
@SuppressWarnings("unused")
public class TalentExperience {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long profileId;

	private String title;

	private String place;

	/** YYYY-MM */
	private String startMonth;

	/** YYYY-MM, null = now */
	private String endMonth;

	private String description;

	private int position;
}
