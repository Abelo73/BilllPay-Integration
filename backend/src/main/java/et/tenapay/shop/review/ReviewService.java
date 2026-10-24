package et.tenapay.shop.review;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.order.FulfilmentStatus;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderItem;
import et.tenapay.shop.order.OrderStatus;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;

/**
 * Reviews from verified buyers (design: product page, shop page, pro profile later). One review per bought item, only
 * after delivery; the shop can reply once; staff can hide a review (it then stops counting). Ratings shown are
 * averages of visible reviews.
 */
@Service
public class ReviewService {

	private final ReviewRepository reviews;
	private final ShopRepository shops;
	private final ProductRepository products;
	private final UserRepository users;
	private final TransactionTemplate tx;

	public ReviewService(ReviewRepository reviews, ShopRepository shops, ProductRepository products, UserRepository users,
			TransactionTemplate tx) {
		this.reviews = reviews;
		this.shops = shops;
		this.products = products;
		this.users = users;
		this.tx = tx;
	}

	public record ReviewView(Long id, Long productId, String productName, short rating, String body, String authorName,
			Instant createdAt, String sellerReply, Instant repliedAt, boolean hidden, String hiddenReason) {
	}

	/** Average (one decimal) and how many reviews gave 1..5 stars. */
	public record Summary(BigDecimal average, long count, Map<Integer, Long> stars) {
	}

	public record ReviewPage(Summary summary, PageDto<ReviewView> reviews) {
	}

	public record Reviewable(Long orderItemId, String orderNumber, Long productId, String productName, String productSlug,
			String imageUrl, Instant deliveredAt) {
	}

	public record Rating(BigDecimal average, long count) {
	}

	// ---------- writing ----------

	public ReviewView create(UUID userId, Long orderItemId, int rating, String body) {
		if (rating < 1 || rating > 5) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_RATING", "Give 1 to 5 stars.");
		}
		String text = body == null || body.isBlank() ? null : body.strip();
		if (text != null && text.length() > 1000) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_LONG", "Keep your review under 1000 characters.");
		}
		try {
			return tx.execute(s -> {
				OrderItem item = reviews.orderItem(orderItemId).orElseThrow(() -> ApiException.notFound("Item"));
				Order o = item.getOrder();
				if (o.getUserId() == null || !o.getUserId().equals(userId)) {
					throw ApiException.notFound("Item"); // not yours: same answer as missing
				}
				if (o.getFulfilmentStatus() != FulfilmentStatus.DELIVERED
						|| !(o.getStatus() == OrderStatus.PAID || o.getStatus() == OrderStatus.PARTIALLY_REFUNDED)) {
					throw new ApiException(HttpStatus.CONFLICT, "NOT_DELIVERED", "You can review an item once it has been delivered.");
				}
				if (reviews.existsByOrderItemId(orderItemId)) {
					throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REVIEWED", "You already reviewed this item.");
				}
				User u = users.findById(userId).orElseThrow();
				Review r = new Review();
				r.setOrderId(o.getId());
				r.setOrderItemId(item.getId());
				r.setProductId(item.getProductId());
				r.setShopId(item.getShopId());
				r.setAuthorId(userId);
				r.setAuthorName(publicName(u.getFullName()));
				r.setRating((short) rating);
				r.setBody(text);
				reviews.saveAndFlush(r);
				return view(r, item.getProductName());
			});
		} catch (DataIntegrityViolationException twice) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REVIEWED", "You already reviewed this item.");
		}
	}

	/** The shop owner answers a review of their shop, once. */
	public ReviewView reply(UUID sellerId, Long reviewId, String text) {
		String reply = text == null ? "" : text.strip();
		if (reply.isEmpty() || reply.length() > 1000) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REPLY", "Write a reply of up to 1000 characters.");
		}
		return tx.execute(s -> {
			Review r = reviews.findById(reviewId).orElseThrow(() -> ApiException.notFound("Review"));
			Shop shop = shops.findByOwnerId(sellerId).orElse(null);
			if (shop == null || r.getShopId() == null || !r.getShopId().equals(shop.getId())) {
				throw ApiException.notFound("Review");
			}
			if (r.getSellerReply() != null) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REPLIED", "You already replied to this review.");
			}
			r.setSellerReply(reply);
			r.setRepliedAt(Instant.now());
			return view(r, null);
		});
	}

	/** Staff moderation: hidden reviews disappear from pages and averages. */
	public ReviewView setHidden(Long reviewId, boolean hidden, String reason) {
		return tx.execute(s -> {
			Review r = reviews.findById(reviewId).orElseThrow(() -> ApiException.notFound("Review"));
			r.setHidden(hidden);
			r.setHiddenReason(hidden ? (reason == null || reason.isBlank() ? null : reason.strip()) : null);
			return view(r, null);
		});
	}

	// ---------- reading ----------

	public List<Reviewable> reviewable(UUID userId) {
		return tx.execute(s -> {
			List<OrderItem> items = reviews.reviewable(userId, PageRequest.of(0, 30));
			Map<Long, et.tenapay.shop.catalog.Product> byId = new HashMap<>();
			products.findAllById(items.stream().map(OrderItem::getProductId).distinct().toList()).forEach(p -> byId.put(p.getId(), p));
			return items.stream().map(i -> {
				var p = byId.get(i.getProductId());
				return new Reviewable(i.getId(), i.getOrder().getOrderNumber(), i.getProductId(), i.getProductName(),
						p == null ? null : p.getSlug(), p == null ? null : p.getImageUrl(), i.getOrder().getDeliveredAt());
			}).toList();
		});
	}

	public ReviewPage forProduct(Long productId, int page) {
		return tx.execute(s -> new ReviewPage(summary(reviews.productStars(productId)),
				PageDto.of(reviews.findByProductIdAndHiddenFalseOrderByCreatedAtDesc(productId, PageRequest.of(page, 10))
						.map(r -> view(r, null)))));
	}

	public ReviewPage forShop(String slug, int page) {
		Shop shop = shops.findBySlug(slug).orElseThrow(() -> ApiException.notFound("Shop"));
		return tx.execute(s -> new ReviewPage(summary(reviews.shopStars(shop.getId())),
				PageDto.of(reviews.findByShopIdAndHiddenFalseOrderByCreatedAtDesc(shop.getId(), PageRequest.of(page, 10))
						.map(r -> view(r, names(r))))));
	}

	/** The seller's own reviews, hidden ones included (so they can see what staff removed). */
	public ReviewPage forSeller(UUID sellerId, int page) {
		Shop shop = shops.findByOwnerId(sellerId).orElseThrow(() -> ApiException.notFound("Shop"));
		return tx.execute(s -> new ReviewPage(summary(reviews.shopStars(shop.getId())),
				PageDto.of(reviews.findByShopIdOrderByCreatedAtDesc(shop.getId(), PageRequest.of(page, 20)).map(r -> view(r, names(r))))));
	}

	public PageDto<ReviewView> forStaff(Boolean hidden, int page) {
		var pr = PageRequest.of(page, 30);
		return tx.execute(s -> PageDto.of((hidden == null ? reviews.findAllByOrderByCreatedAtDesc(pr)
				: reviews.findByHiddenOrderByCreatedAtDesc(hidden, pr)).map(r -> view(r, names(r)))));
	}

	/** Average rating per product, for product cards and lists. */
	public Map<Long, Rating> ratings(List<Long> productIds) {
		Map<Long, Rating> out = new HashMap<>();
		if (productIds.isEmpty()) {
			return out;
		}
		for (Object[] row : reviews.productAverages(productIds)) {
			out.put((Long) row[0], new Rating(BigDecimal.valueOf(((Number) row[1]).doubleValue()).setScale(1, RoundingMode.HALF_UP),
					((Number) row[2]).longValue()));
		}
		return out;
	}

	// ---------- helpers ----------

	private String names(Review r) {
		return products.findById(r.getProductId()).map(et.tenapay.shop.catalog.Product::getName).orElse(null);
	}

	private static Summary summary(List<Object[]> rows) {
		Map<Integer, Long> stars = new HashMap<>();
		for (int i = 1; i <= 5; i++) {
			stars.put(i, 0L);
		}
		long count = 0;
		long sum = 0;
		for (Object[] row : rows) {
			int rating = ((Number) row[0]).intValue();
			long n = ((Number) row[1]).longValue();
			stars.put(rating, n);
			count += n;
			sum += rating * n;
		}
		BigDecimal avg = count == 0 ? null : BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(count), 1, RoundingMode.HALF_UP);
		return new Summary(avg, count, stars);
	}

	private static ReviewView view(Review r, String productName) {
		return new ReviewView(r.getId(), r.getProductId(), productName, r.getRating(), r.getBody(), r.getAuthorName(),
				r.getCreatedAt(), r.getSellerReply(), r.getRepliedAt(), r.isHidden(), r.getHiddenReason());
	}

	/** "Hana Girma" → "Hana G." so full names aren't published. */
	static String publicName(String fullName) {
		if (fullName == null || fullName.isBlank()) {
			return "Buyer";
		}
		String[] parts = fullName.strip().split("\\s+");
		String first = parts[0].length() > 40 ? parts[0].substring(0, 40) : parts[0];
		return parts.length > 1 ? first + " " + parts[parts.length - 1].charAt(0) + "." : first;
	}
}
