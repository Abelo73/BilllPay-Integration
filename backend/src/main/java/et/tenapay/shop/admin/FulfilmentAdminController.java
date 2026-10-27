package et.tenapay.shop.admin;

import java.util.Map;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.order.FulfilmentService;
import et.tenapay.shop.order.FulfilmentStatus;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin: move paid orders through delivery, cancel unpaid ones. ADMIN only (POST under /api/admin). */
@RestController
@RequestMapping("/api/admin/orders/{orderNumber}")
@RequiredArgsConstructor
public class FulfilmentAdminController {

	private final FulfilmentService fulfilment;
	private final et.tenapay.shop.order.ParcelCancelService parcelCancel;

	public record FulfilmentRequest(@NotNull FulfilmentStatus status, @Size(max = 300) String note) {
	}

	public record CancelRequest(@Size(max = 300) String reason) {
	}

	@PostMapping("/fulfilment")
	public Map<String, Object> advance(@PathVariable String orderNumber, @Valid @RequestBody FulfilmentRequest req) {
		if (req.status() == FulfilmentStatus.CANCELLED) {
			// a paid order: each parcel not yet sent is refunded through BillPay, then cancelled
			var done = parcelCancel.orderByStaff(orderNumber, req.note(), staff());
			return Map.of("orderNumber", orderNumber, "fulfilmentStatus", FulfilmentStatus.CANCELLED.name(), "refunds", done);
		}
		Order o = fulfilment.advance(orderNumber, req.status(), req.note(), staff());
		return Map.of("orderNumber", o.getOrderNumber(), "fulfilmentStatus", o.getFulfilmentStatus().name());
	}

	/** One seller's parcel (staff can move any parcel, including cancelling it before it ships). */
	@PostMapping("/parcels/{parcelNo}/fulfilment")
	public Map<String, Object> advanceParcel(@PathVariable String orderNumber, @PathVariable int parcelNo,
			@Valid @RequestBody FulfilmentRequest req) {
		if (req.status() == FulfilmentStatus.CANCELLED) {
			// refunded through BillPay first, then cancelled (it used to cancel without giving the money back)
			var r = parcelCancel.byStaff(orderNumber, parcelNo, req.note(), staff());
			return Map.of("orderNumber", orderNumber, "parcelNo", parcelNo, "fulfilmentStatus", FulfilmentStatus.CANCELLED.name(),
					"refunded", r.refunded(), "refundStatus", r.refundStatus());
		}
		var p = fulfilment.advanceParcel(orderNumber, parcelNo, req.status(), req.note(), staff(), null);
		return Map.of("orderNumber", orderNumber, "parcelNo", p.getParcelNo(), "fulfilmentStatus", p.getFulfilmentStatus().name());
	}

	@PostMapping("/cancel")
	public Map<String, Object> cancel(@PathVariable String orderNumber,
			@Valid @RequestBody(required = false) CancelRequest req) {
		Order o = fulfilment.cancelUnpaid(orderNumber, req == null ? null : req.reason(), staff());
		return Map.of("orderNumber", o.getOrderNumber(), "status", o.getStatus().name());
	}

	private static String staff() {
		return CurrentUser.get().map(CurrentUser::email).orElse("staff");
	}
}
