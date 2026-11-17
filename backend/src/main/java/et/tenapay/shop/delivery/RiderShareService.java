package et.tenapay.shop.delivery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.order.FulfilmentStatus;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;

/**
 * Delivery tracking. A rider gets a personal link by SMS. While they are on the way with that parcel, the link shares
 * their location for that parcel only. Sharing stops by itself when the parcel is delivered or cancelled, when the link
 * runs out, or when the parcel goes to another rider. Only the latest point is kept, and the buyer only sees a point
 * that is fresh.
 */
@Service
@RequiredArgsConstructor
public class RiderShareService {

	/** How long a rider's link works (a parcel usually takes less). */
	static final Duration LINK_FOR = Duration.ofHours(12);
	/** A point older than this is not shown to the buyer. */
	static final Duration FRESH_FOR = Duration.ofMinutes(3);
	/** Above this speed (about 16 km/h) the rider is treated as driving, below it as walking. */
	static final double CAR_ABOVE_MPS = 4.5;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final RiderShareLinkRepository links;
	private final ParcelLiveLocationRepository locations;
	private final OrderParcelRepository parcels;
	private final OrderRepository orders;
	private final SmsService sms;
	private final AppProperties app;

	/** What the rider's link page shows. Nothing about the buyer. */
	public record ShareStatus(String orderNumber, int parcelNo, boolean onTheWay, boolean ended, Instant expiresAt, String travelMode) {
	}

	/** What the buyer sees on their order: the latest fresh point, if any. */
	public record LiveView(int parcelNo, double latitude, double longitude, String travelMode, Instant updatedAt) {
	}

	/** Sends the rider their personal link for this parcel (by SMS). A new link replaces the old ones for the parcel. */
	@Transactional
	public void issueFor(OrderParcel parcel, Long riderId, String riderPhone, String orderNumber) {
		String secret = createLink(parcel.getId(), riderId);
		String url = app.publicBaseUrl() + "/rider/track/" + secret;
		String number = parcel.number(orderNumber);
		// the stored copy leaves the link out: the SMS log must not hold a working secret
		sms.send(SmsService.Kind.DELIVERY, riderPhone,
				"Sodo Gebeya: open this link to share your location while you bring " + number + ". It stops when the order is delivered. " + url,
				"Rider location link sent for " + number, orderNumber);
	}

	/** Makes a new link for this rider and parcel and returns its secret. Only the SMS (and tests) get to see the secret. */
	@Transactional
	public String createLink(Long parcelId, Long riderId) {
		byte[] raw = new byte[32];
		RANDOM.nextBytes(raw);
		String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
		Instant now = Instant.now();
		RiderShareLink link = new RiderShareLink();
		link.setTokenHash(hash(secret));
		link.setParcelId(parcelId);
		link.setRiderId(riderId);
		link.setCreatedAt(now);
		link.setExpiresAt(now.plus(LINK_FOR));
		links.save(link);
		return secret;
	}

	/** The rider's page: is their parcel on the way, and is the link still working. */
	@Transactional(readOnly = true)
	public ShareStatus status(String secret) {
		Found f = find(secret);
		boolean onTheWay = f.parcel().getFulfilmentStatus() == FulfilmentStatus.SHIPPED;
		String mode = locations.findById(f.parcel().getId()).map(ParcelLiveLocation::getTravelMode).orElse(null);
		return new ShareStatus(f.orderNumber(), f.parcel().getParcelNo(), onTheWay && !f.ended(), f.ended(), f.link().getExpiresAt(), mode);
	}

	/** One point from the rider. Accepted only while the parcel is on its way and the link works. */
	@Transactional
	public void share(String secret, double latitude, double longitude, Double speedMps, String travelMode) {
		Found f = find(secret);
		if (f.ended() || f.parcel().getFulfilmentStatus() != FulfilmentStatus.SHIPPED) {
			throw new ApiException(HttpStatus.GONE, "SHARE_ENDED", "Sharing has ended for this order.");
		}
		if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_POINT", "That location is not valid.");
		}
		String mode = travelMode != null && (travelMode.equals("CAR") || travelMode.equals("WALK"))
				? travelMode
				: speedMps != null && speedMps >= CAR_ABOVE_MPS ? "CAR" : "WALK";
		ParcelLiveLocation point = locations.findById(f.parcel().getId()).orElseGet(ParcelLiveLocation::new);
		point.setParcelId(f.parcel().getId());
		point.setLatitude(java.math.BigDecimal.valueOf(latitude).setScale(6, java.math.RoundingMode.HALF_UP));
		point.setLongitude(java.math.BigDecimal.valueOf(longitude).setScale(6, java.math.RoundingMode.HALF_UP));
		point.setTravelMode(mode);
		point.setUpdatedAt(Instant.now());
		locations.save(point);
	}

	/** The rider stops sharing for now. The link still works; they can start again. */
	@Transactional
	public void stop(String secret) {
		Found f = find(secret);
		locations.deleteById(f.parcel().getId());
	}

	/** The buyer's view: their parcel's latest fresh point, if the parcel is on its way. Only for the order's owner. */
	@Transactional(readOnly = true)
	public java.util.List<LiveView> liveFor(UUID userId, String orderNumber) {
		Order order = orders.findByOrderNumber(orderNumber).filter(o -> userId.equals(o.getUserId()))
				.orElseThrow(() -> ApiException.notFound("Order"));
		Instant freshAfter = Instant.now().minus(FRESH_FOR);
		return parcels.findByOrderIdOrderByParcelNoAsc(order.getId()).stream()
				.filter(p -> p.getFulfilmentStatus() == FulfilmentStatus.SHIPPED)
				.flatMap(p -> locations.findById(p.getId()).filter(l -> l.getUpdatedAt().isAfter(freshAfter)).stream()
						.map(l -> new LiveView(p.getParcelNo(), l.getLatitude().doubleValue(), l.getLongitude().doubleValue(), l.getTravelMode(), l.getUpdatedAt()))
						.limit(1))
				.toList();
	}

	/** Old points are removed (they are only kept while they are useful). */
	@Scheduled(fixedRate = 3_600_000)
	@Transactional
	public void forgetOldPoints() {
		locations.deleteOlderThan(Instant.now().minus(Duration.ofDays(1)));
	}

	private record Found(RiderShareLink link, OrderParcel parcel, String orderNumber, boolean ended) {
	}

	/** Finds the link by its secret. A link stops working when its parcel changes rider, closes, or runs out. */
	private Found find(String secret) {
		RiderShareLink link = links.findByTokenHash(hash(secret == null ? "" : secret))
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "LINK_NOT_FOUND", "This link is not valid."));
		OrderParcel parcel = parcels.findById(link.getParcelId()).orElseThrow(() -> ApiException.notFound("Parcel"));
		Order order = orders.findById(parcel.getOrderId()).orElseThrow(() -> ApiException.notFound("Order"));
		boolean ended = link.getExpiresAt().isBefore(Instant.now())
				|| !link.getRiderId().equals(parcel.getRiderId())
				|| parcel.getFulfilmentStatus() == FulfilmentStatus.DELIVERED
				|| parcel.getFulfilmentStatus() == FulfilmentStatus.CANCELLED;
		return new Found(link, parcel, order.getOrderNumber(), ended);
	}

	static String hash(String secret) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
		} catch (java.security.NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
