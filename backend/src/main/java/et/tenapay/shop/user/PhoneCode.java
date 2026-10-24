package et.tenapay.shop.user;

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

/** A one-time sign-in code sent by SMS. Only an HMAC of the code is kept. */
@Entity
@Table(name = "phone_codes")
@Getter
@Setter
@NoArgsConstructor
public class PhoneCode {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String phone;

	private String codeHash;

	private String purpose = "SIGN_IN";

	private int attempts;

	private Instant expiresAt;

	/** Signed in, replaced by a newer code, or locked after too many wrong tries. */
	private Instant usedAt;

	private String ip;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	public boolean isActive(Instant now) {
		return usedAt == null && expiresAt.isAfter(now);
	}
}
