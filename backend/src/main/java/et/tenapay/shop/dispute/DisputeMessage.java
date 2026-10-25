package et.tenapay.shop.dispute;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "dispute_messages")
@Getter
@Setter
@NoArgsConstructor
public class DisputeMessage {

	public enum Author { BUYER, SELLER, STAFF }

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long disputeId;

	@Enumerated(EnumType.STRING)
	private Author author;

	private String authorName;

	private String body;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;
}
