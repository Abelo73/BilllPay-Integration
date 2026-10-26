package et.tenapay.shop.promo;

import java.time.Instant;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** M17: a banner on the home page (a shop's sale, an event, our own news), managed in Admin → Banners. */
@Entity
@Table(name = "banner_ads")
@Getter
@Setter
@NoArgsConstructor
public class BannerAd {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String title;

	private String subtitle;

	private String imageKey;

	private String linkUrl;

	private Instant startsAt;

	private Instant endsAt;

	private boolean active = true;

	private int position;

	private int clicks;

	@Column(updatable = false, insertable = false)
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;

	public boolean showing(Instant now) {
		return active && (startsAt == null || !startsAt.isAfter(now)) && (endsAt == null || endsAt.isAfter(now));
	}
}
