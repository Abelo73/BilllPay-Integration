package et.tenapay.shop.user;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One sign-in attempt (successful or not), for the admin's login history. */
@Entity
@Table(name = "login_events")
@Getter
@Setter
@NoArgsConstructor
public class LoginEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private UUID userId;

	private String email;

	private String portal;

	private boolean success;

	private String reason;

	private String ip;

	private String userAgent;

	@Column(updatable = false)
	private Instant createdAt = Instant.now();
}
