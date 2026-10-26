package et.tenapay.shop.delivery;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin → Riders, and putting a rider on a parcel (M21). Reading is open to support staff; changes are admin-only. */
@RestController
@RequiredArgsConstructor
public class RiderAdminController {

	private final RiderService riders;

	public record RiderRequest(@Size(max = 120) String name, @Size(max = 30) String phone, @Size(max = 300) String note,
			Boolean active) {
	}

	public record AssignRequest(Long riderId) {
	}

	@GetMapping("/api/admin/riders")
	public List<RiderService.RiderRow> list() {
		return riders.list();
	}

	@PostMapping("/api/admin/riders")
	public RiderService.RiderRow create(@Valid @RequestBody RiderRequest req) {
		return riders.save(null, req.name(), req.phone(), req.note(), req.active());
	}

	@PatchMapping("/api/admin/riders/{id}")
	public RiderService.RiderRow update(@PathVariable Long id, @Valid @RequestBody RiderRequest req) {
		return riders.save(id, req.name(), req.phone(), req.note(), req.active());
	}

	/** {@code riderId} null takes the rider off the parcel. */
	@PutMapping("/api/admin/orders/{orderNumber}/parcels/{parcelNo}/rider")
	public Map<String, Object> assign(@PathVariable String orderNumber, @PathVariable int parcelNo,
			@RequestBody AssignRequest req) {
		RiderService.RiderCard card = riders.assign(orderNumber, parcelNo, req == null ? null : req.riderId());
		return card == null ? Map.of("rider", false) : Map.of("rider", card);
	}
}
