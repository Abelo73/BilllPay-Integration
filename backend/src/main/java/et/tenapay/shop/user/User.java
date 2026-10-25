package et.tenapay.shop.user;

import java.time.Instant;
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

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	private String email;

	private String passwordHash;

	private String fullName;

	private String phone;

	/** Set once the owner proved the phone with an SMS code; only then can it be used to sign in. */
	private Instant phoneVerifiedAt;

	/** Site language, "en" or "am"; SMS and alerts follow it. */
	private String language = "en";

	@Enumerated(EnumType.STRING)
	private Role role;

	private boolean enabled = true;

	private int tokenVersion;

	private int failedLogins;

	private Instant lockedUntil;

	private Instant lastLoginAt;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();

	@UpdateTimestamp
	private Instant updatedAt;

	@Version
	private Integer version;

	public boolean isPhoneVerified() {
		return phoneVerifiedAt != null;
	}

	public boolean hasPassword() {
		return passwordHash != null;
	}

	public boolean isLocked() {
		return lockedUntil != null && lockedUntil.isAfter(Instant.now());
	}

	/** Invalidates every token issued so far for this user. */
	public void revokeSessions() {
		tokenVersion++;
	}
}
