package et.tenapay.shop.delivery;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
import et.tenapay.shop.order.CheckoutService;
import et.tenapay.shop.order.FulfilmentStatus;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.order.OrderService;
import lombok.RequiredArgsConstructor;

/**
 * Partner riders (M21): staff keep the list and put a rider on each parcel. The buyer then sees who brings it and can
 * call them, and gets a notification.
 */
@Service
@RequiredArgsConstructor
public class RiderService {

	private static final Pattern MOBILE = Pattern.compile("^\\+251[79]\\d{8}$");

	private final RiderRepository riders;
	private final OrderRepository orders;
	private final OrderParcelRepository parcels;
	private final OrderService orderService;
	private final InboxService inbox;

	public record RiderRow(Long id, String name, String phone, String note, boolean active) {

		static RiderRow of(Rider r) {
			return new RiderRow(r.getId(), r.getName(), r.getPhone(), r.getNote(), r.isActive());
		}
	}

	/** What the buyer sees on a parcel. */
	public record RiderCard(String name, String phone) {
	}

	@Transactional(readOnly = true)
	public List<RiderRow> list() {
		return riders.findAllByOrderByActiveDescNameAsc().stream().map(RiderRow::of).toList();
	}

	@Transactional
	public RiderRow save(Long id, String name, String phone, String note, Boolean active) {
		Rider r = id == null ? new Rider() : riders.findById(id).orElseThrow(() -> ApiException.notFound("Rider"));
		if (name != null) {
			if (name.isBlank()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "Enter the rider's name.");
			}
			r.setName(name.trim());
		}
		if (phone != null) {
			String p = CheckoutService.normalizePhone(phone);
			if (!MOBILE.matcher(p).matches()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PHONE", "Enter an Ethiopian mobile number, like 0911 234 567.");
			}
			r.setPhone(p);
		}
		if (note != null) {
			r.setNote(note.isBlank() ? null : note.trim());
		}
		if (active != null) {
			r.setActive(active);
		}
		if (r.getName() == null || r.getPhone() == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "RIDER_INCOMPLETE", "A rider needs a name and a phone number.");
		}
		return RiderRow.of(riders.save(r));
	}

	/** Puts a rider on one parcel ({@code riderId} null takes them off). Tells the buyer when a rider is set. */
	@Transactional
	public RiderCard assign(String orderNumber, int parcelNo, Long riderId) {
		Order order = orders.findByOrderNumber(orderNumber).orElseThrow(() -> ApiException.notFound("Order"));
		OrderParcel parcel = parcels.findByOrderIdOrderByParcelNoAsc(order.getId()).stream()
				.filter(p -> p.getParcelNo() == parcelNo).findFirst().orElseThrow(() -> ApiException.notFound("Parcel"));
		if (parcel.getFulfilmentStatus() == FulfilmentStatus.DELIVERED || parcel.getFulfilmentStatus() == FulfilmentStatus.CANCELLED) {
			throw new ApiException(HttpStatus.CONFLICT, "PARCEL_CLOSED", "This parcel is already delivered or cancelled.");
		}
		String number = parcel.number(orderNumber);
		if (riderId == null) {
			parcel.setRiderId(null);
			parcel.setRiderAssignedAt(null);
			orderService.note(order, "RIDER_REMOVED", "Parcel " + number + ": no rider");
			return null;
		}
		Rider r = riders.findById(riderId).orElseThrow(() -> ApiException.notFound("Rider"));
		if (!r.isActive()) {
			throw new ApiException(HttpStatus.CONFLICT, "RIDER_INACTIVE", "This rider is switched off. Switch them on in Riders first.");
		}
		boolean changed = !riderId.equals(parcel.getRiderId());
		parcel.setRiderId(riderId);
		parcel.setRiderAssignedAt(Instant.now());
		if (changed) {
			orderService.note(order, "RIDER_ASSIGNED", "Parcel " + number + ": " + r.getName() + " (" + r.getPhone() + ")");
			inbox.notify(order.getUserId(), InboxItem.Kind.DELIVERY, "A rider is bringing your order",
					r.getName() + " (" + r.getPhone() + ") will bring " + number + ".", "/orders/track?order=" + orderNumber,
					"INBOX:RIDER:" + number + ":" + riderId);
		}
		return new RiderCard(r.getName(), r.getPhone());
	}

	/** The rider on a parcel, for the buyer's tracking page. */
	@Transactional(readOnly = true)
	public Optional<RiderCard> card(Long riderId) {
		return riderId == null ? Optional.empty() : riders.findById(riderId).map(r -> new RiderCard(r.getName(), r.getPhone()));
	}
}
