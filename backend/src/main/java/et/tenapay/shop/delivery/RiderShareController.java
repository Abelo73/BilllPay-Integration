package et.tenapay.shop.delivery;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;

/** The rider's link (no sign-in: the secret in the link is the key) and the buyer's view of the rider on their order. */
@RestController
@RequiredArgsConstructor
public class RiderShareController {

	private final RiderShareService share;

	public record Point(@NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
			@NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
			@DecimalMin("0") @DecimalMax("100") Double speed,
			@Pattern(regexp = "^(CAR|WALK)$") String travelMode) {
	}

	@GetMapping("/api/rider/share/{secret}")
	public RiderShareService.ShareStatus status(@PathVariable String secret) {
		return share.status(secret);
	}

	@PostMapping("/api/rider/share/{secret}/location")
	public Map<String, Boolean> point(@PathVariable String secret, @Valid @RequestBody Point p) {
		share.share(secret, p.latitude(), p.longitude(), p.speed(), p.travelMode());
		return Map.of("ok", true);
	}

	@PostMapping("/api/rider/share/{secret}/stop")
	public Map<String, Boolean> stop(@PathVariable String secret) {
		share.stop(secret);
		return Map.of("ok", true);
	}

	/** Signed-in buyers only: where their parcel is right now (only while it is on the way and the point is fresh). */
	@GetMapping("/api/orders/{orderNumber}/rider-location")
	public List<RiderShareService.LiveView> riderLocation(@PathVariable String orderNumber) {
		return share.liveFor(et.tenapay.shop.user.CurrentUser.require().id(), orderNumber);
	}
}
