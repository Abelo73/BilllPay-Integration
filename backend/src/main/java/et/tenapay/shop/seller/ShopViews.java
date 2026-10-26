package et.tenapay.shop.seller;

import java.time.Instant;

import et.tenapay.shop.media.MediaProperties;

/** What the seller, staff and shoppers see of a shop. Shoppers never get the phone, address or staff notes. */
public final class ShopViews {

	private ShopViews() {
	}

	/** For the shop's owner and for staff. */
	public record ShopDto(Long id, String kind, String name, String slug, String description, String phone,
			String area, String addressLine, String logoUrl, String coverUrl, String status, String statusNote,
			Instant decidedAt, Instant createdAt, Instant verifiedAt, boolean pro, Instant planUntil) {

		public static ShopDto of(Shop s, MediaProperties media) {
			return new ShopDto(s.getId(), s.getKind().name(), s.getName(), s.getSlug(), s.getDescription(),
					s.getPhone(), s.getArea(), s.getAddressLine(), url(s.getLogoKey(), media),
					url(s.getCoverKey(), media), s.getStatus().name(), s.getStatusNote(), s.getDecidedAt(),
					s.getCreatedAt(), s.getVerifiedAt(), s.pro(), s.getPlanUntil());
		}
	}

	/** The public shop page. */
	public record PublicShopDto(String name, String slug, String kind, String description, String area,
			String logoUrl, String coverUrl, Instant memberSince, long productCount, boolean verified, boolean pro) {

		public static PublicShopDto of(Shop s, MediaProperties media, long productCount) {
			return new PublicShopDto(s.getName(), s.getSlug(), s.getKind().name(), s.getDescription(), s.getArea(),
					url(s.getLogoKey(), media), url(s.getCoverKey(), media), s.getCreatedAt(), productCount,
					s.getVerifiedAt() != null, s.pro());
		}
	}

	static String url(String key, MediaProperties media) {
		return key == null ? null : media.urlFor(key);
	}
}
