package et.tenapay.shop.order;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopService;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Cancel a paid parcel before it is sent and refund it: the buyer (before packing starts) or the seller (before it ships). */
@RestController
@RequiredArgsConstructor
public class ParcelCancelController {

	private final ParcelCancelService service;
	private final ShopService shops;

	public record CancelRequest(@Size(max = 300) String reason) {
	}

	@PostMapping("/api/orders/{orderNumber}/parcels/{parcelNo}/cancel")
	public ParcelCancelService.Result buyerCancels(@PathVariable String orderNumber, @PathVariable int parcelNo,
			@Valid @RequestBody(required = false) CancelRequest r) {
		CurrentUser u = CurrentUser.require();
		if (u.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "CUSTOMERS_ONLY", "Staff cancel orders in Admin → Orders.");
		}
		return service.byBuyer(u.id(), orderNumber, parcelNo, r == null ? null : r.reason());
	}

	/** The seller's own parcel of this order (out of stock, can't deliver): the buyer gets a full refund. */
	@PostMapping("/api/seller/orders/{orderNumber}/cancel")
	public ParcelCancelService.Result sellerCancels(@PathVariable String orderNumber, @Valid @RequestBody CancelRequest r) {
		Shop shop = shops.requireMine();
		return service.bySeller(shop.getId(), shop.getName(), orderNumber, r.reason());
	}
}
