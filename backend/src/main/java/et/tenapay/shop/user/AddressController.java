package et.tenapay.shop.user;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** The signed-in customer's address book, used to prefill checkout. */
@RestController
@RequestMapping("/api/me/addresses")
@RequiredArgsConstructor
public class AddressController {

	public static final int MAX_ADDRESSES = 10;

	private final CustomerAddressRepository addresses;

	public record AddressRequest(
			@Size(max = 50) String label,
			@NotBlank @Size(max = 200) String recipientName,
			@NotBlank @Pattern(regexp = "^\\+?[0-9 ()-]{9,20}$", message = "must be a valid phone number") String phone,
			@NotBlank @Size(max = 300) String addressLine,
			@NotBlank @Size(max = 100) String city,
			@Size(max = 300) String notes,
			Boolean makeDefault) {
	}

	public record AddressView(Long id, String label, String recipientName, String phone, String addressLine,
			String city, String notes, boolean isDefault) {

		static AddressView of(CustomerAddress a) {
			return new AddressView(a.getId(), a.getLabel(), a.getRecipientName(), a.getPhone(), a.getAddressLine(),
					a.getCity(), a.getNotes(), a.isDefaultAddress());
		}
	}

	@GetMapping
	@Transactional(readOnly = true)
	public List<AddressView> list() {
		return addresses.findByUserIdOrderByDefaultAddressDescCreatedAtAsc(me()).stream().map(AddressView::of).toList();
	}

	@PostMapping
	@Transactional
	public List<AddressView> create(@Valid @RequestBody AddressRequest req) {
		UUID userId = me();
		if (addresses.countByUserId(userId) >= MAX_ADDRESSES) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_ADDRESSES",
					"You can save up to " + MAX_ADDRESSES + " addresses. Remove one first.");
		}
		CustomerAddress a = new CustomerAddress();
		a.setUserId(userId);
		boolean first = addresses.countByUserId(userId) == 0;
		apply(a, req);
		a.setDefaultAddress(first || Boolean.TRUE.equals(req.makeDefault()));
		addresses.save(a);
		if (a.isDefaultAddress()) {
			addresses.clearDefaultExcept(userId, a.getId());
		}
		return list();
	}

	@PutMapping("/{id}")
	@Transactional
	public List<AddressView> update(@PathVariable Long id, @Valid @RequestBody AddressRequest req) {
		UUID userId = me();
		CustomerAddress a = addresses.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Address"));
		apply(a, req);
		if (Boolean.TRUE.equals(req.makeDefault())) {
			a.setDefaultAddress(true);
			addresses.clearDefaultExcept(userId, a.getId());
		}
		return list();
	}

	@DeleteMapping("/{id}")
	@Transactional
	public List<AddressView> delete(@PathVariable Long id) {
		UUID userId = me();
		CustomerAddress a = addresses.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Address"));
		boolean wasDefault = a.isDefaultAddress();
		addresses.delete(a);
		addresses.flush();
		if (wasDefault) {
			addresses.findByUserIdOrderByDefaultAddressDescCreatedAtAsc(userId).stream().findFirst()
					.ifPresent(next -> next.setDefaultAddress(true));
		}
		return list();
	}

	private static void apply(CustomerAddress a, AddressRequest req) {
		a.setLabel(req.label() == null || req.label().isBlank() ? "Home" : req.label().trim());
		a.setRecipientName(req.recipientName().trim());
		a.setPhone(et.tenapay.shop.order.CheckoutService.normalizePhone(req.phone()));
		a.setAddressLine(req.addressLine().trim());
		a.setCity(req.city().trim());
		a.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
	}

	private static UUID me() {
		CurrentUser user = CurrentUser.require();
		if (user.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "CUSTOMERS_ONLY", "Only customer accounts have an address book.");
		}
		return user.id();
	}
}
