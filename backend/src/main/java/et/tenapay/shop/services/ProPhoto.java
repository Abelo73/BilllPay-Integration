package et.tenapay.shop.services;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A photo of past work on a pro's profile. */
@Entity
@Table(name = "pro_photos")
@Getter
@Setter
@NoArgsConstructor
public class ProPhoto {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long proId;

	private String imageKey;

	private int position;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
