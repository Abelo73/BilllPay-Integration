package et.tenapay.shop.order;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopService;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;

/** M7: "Cash received" for cash-on-delivery orders, by the seller for their parcel or by staff for any parcel. */
@RestController
@RequiredArgsConstructor
public class CashOrderController {

	private final CashOrderService cash;
	private final ShopService shops;

	@PostMapping("/api/seller/orders/{orderNumber}/cash-received")
	public CashOrderService.Result sellerCollected(@PathVariable String orderNumber) {
		Shop shop = shops.requireMine();
		return cash.bySeller(orderNumber, shop.getId(), shop.getName());
	}

	/** ADMIN only (POST under /api/admin). */
	@PostMapping("/api/admin/orders/{orderNumber}/parcels/{parcelNo}/cash-received")
	public CashOrderService.Result staffCollected(@PathVariable String orderNumber, @PathVariable int parcelNo) {
		return cash.byStaff(orderNumber, parcelNo, CurrentUser.get().map(CurrentUser::email).orElse("staff"));
	}
}
