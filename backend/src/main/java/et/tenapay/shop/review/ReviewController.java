package et.tenapay.shop.review;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.review.ReviewService.ReviewPage;
import et.tenapay.shop.review.ReviewService.ReviewView;
import et.tenapay.shop.review.ReviewService.Reviewable;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Reviews: public reading, buyers writing, shop owners replying, staff hiding. */
@RestController
@RequiredArgsConstructor
public class ReviewController {

	private final ReviewService reviews;

	public record CreateRequest(@NotNull Long orderItemId, @Min(1) @Max(5) int rating, @Size(max = 1000) String body) {
	}

	public record ReplyRequest(@Size(max = 1000) String text) {
	}

	public record HideRequest(boolean hidden, @Size(max = 300) String reason) {
	}

	private static UUID customer() {
		return CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
				"Please sign in with a customer account."));
	}

	@GetMapping("/api/products/{productId:\\d+}/reviews")
	public ReviewPage product(@PathVariable Long productId, @RequestParam(defaultValue = "0") int page) {
		return reviews.forProduct(productId, page);
	}

	@GetMapping("/api/shops/{slug}/reviews")
	public ReviewPage shop(@PathVariable String slug, @RequestParam(defaultValue = "0") int page) {
		return reviews.forShop(slug, page);
	}

	/** Items from delivered orders that are waiting for a review. */
	@GetMapping("/api/me/reviewable")
	public List<Reviewable> reviewable() {
		return reviews.reviewable(customer());
	}

	@PostMapping("/api/reviews")
	public ReviewView create(@Valid @RequestBody CreateRequest req) {
		return reviews.create(customer(), req.orderItemId(), req.rating(), req.body());
	}

	@GetMapping("/api/seller/reviews")
	public ReviewPage mine(@RequestParam(defaultValue = "0") int page) {
		return reviews.forSeller(customer(), page);
	}

	@PostMapping("/api/seller/reviews/{id}/reply")
	public ReviewView reply(@PathVariable Long id, @Valid @RequestBody ReplyRequest req) {
		return reviews.reply(customer(), id, req.text());
	}

	@GetMapping("/api/admin/reviews")
	public PageDto<ReviewView> staffList(@RequestParam(required = false) Boolean hidden, @RequestParam(defaultValue = "0") int page) {
		return reviews.forStaff(hidden, page);
	}

	@PostMapping("/api/admin/reviews/{id}/hide")
	public ReviewView hide(@PathVariable Long id, @Valid @RequestBody HideRequest req) {
		return reviews.setHidden(id, req.hidden(), req.reason());
	}
}
