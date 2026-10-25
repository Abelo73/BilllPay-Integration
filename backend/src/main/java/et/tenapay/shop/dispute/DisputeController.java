package et.tenapay.shop.dispute;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopService;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** M8 for buyers and sellers: report a problem with a parcel, talk it through, and see how it was settled. */
@RestController
@RequiredArgsConstructor
public class DisputeController {

	private final DisputeService service;
	private final DisputeViews views;
	private final DisputeRepository disputes;
	private final ShopService shops;
	private final TransactionTemplate tx;

	public record OpenRequest(@NotNull Dispute.Reason reason, @Size(max = 2000) String details) {
	}

	public record MessageRequest(@Size(max = 2000) String body) {
	}

	// ---------- buyer ----------

	@PostMapping("/api/orders/{orderNumber}/parcels/{parcelNo}/disputes")
	public DisputeViews.DisputeView open(@PathVariable String orderNumber, @PathVariable int parcelNo, @Valid @RequestBody OpenRequest r) {
		UUID me = customer();
		Dispute d = service.open(me, orderNumber, parcelNo, r.reason(), r.details());
		return read(() -> views.view(disputes.findById(d.getId()).orElseThrow(), DisputeService.Viewer.BUYER));
	}

	/** The problems reported on one of my orders (for the order page). */
	@GetMapping("/api/orders/{orderNumber}/disputes")
	public List<DisputeViews.DisputeRow> forOrder(@PathVariable String orderNumber) {
		UUID me = customer();
		return read(() -> {
			Order o = service.ownedOrder(me, orderNumber);
			return disputes.findByOrderIdOrderByIdDesc(o.getId()).stream().map(views::row).toList();
		});
	}

	@GetMapping("/api/me/disputes")
	public List<DisputeViews.DisputeRow> mine() {
		UUID me = customer();
		return read(() -> disputes.findByBuyerIdOrderByIdDesc(me).stream().map(views::row).toList());
	}

	@PostMapping(path = "/api/disputes/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public DisputeViews.DisputeView photo(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		UUID me = customer();
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo.");
		}
		service.addPhoto(me, id, file.getBytes());
		return get(id);
	}

	@PostMapping("/api/disputes/{id}/withdraw")
	public DisputeViews.DisputeView withdraw(@PathVariable Long id) {
		service.withdraw(customer(), id);
		return get(id);
	}

	// ---------- buyer or seller ----------

	@GetMapping("/api/disputes/{id}")
	public DisputeViews.DisputeView get(@PathVariable Long id) {
		UUID me = customer();
		return read(() -> {
			Dispute d = disputes.findById(id).orElseThrow(() -> ApiException.notFound("Problem"));
			DisputeService.Viewer v = viewer(d, me);
			return views.view(d, v);
		});
	}

	@PostMapping("/api/disputes/{id}/messages")
	public DisputeViews.DisputeView message(@PathVariable Long id, @Valid @RequestBody MessageRequest r) {
		UUID me = customer();
		Dispute d = disputes.findById(id).orElseThrow(() -> ApiException.notFound("Problem"));
		DisputeService.Viewer v = viewer(d, me);
		String name = v == DisputeService.Viewer.SELLER ? shops.requireMine().getName() : "Buyer";
		service.message(d, v, name, r.body());
		return get(id);
	}

	@GetMapping("/api/disputes/{id}/photos/{photoId}")
	public ResponseEntity<byte[]> photoFile(@PathVariable Long id, @PathVariable Long photoId) {
		UUID me = customer();
		Dispute d = disputes.findById(id).orElseThrow(() -> ApiException.notFound("Problem"));
		viewer(d, me);
		return service.photo(d, photoId);
	}

	// ---------- seller ----------

	/** The problems buyers reported about my shop's parcels, open ones first. */
	@GetMapping("/api/seller/disputes")
	public List<DisputeViews.DisputeRow> forMyShop() {
		Shop shop = shops.requireMine();
		return read(() -> disputes.findByShopIdOrderByIdDesc(shop.getId()).stream()
				.sorted((a, b) -> Boolean.compare(b.getStatus().open(), a.getStatus().open()))
				.map(views::row).toList());
	}

	// ---------- helpers ----------

	private DisputeService.Viewer viewer(Dispute d, UUID me) {
		DisputeService.Viewer v = service.viewerOf(d, me);
		if (v == null) {
			throw ApiException.notFound("Problem");
		}
		return v;
	}

	/** Views read lazy order lines, so they run in their own read-only transaction (never the shared template's settings). */
	private <T> T read(Supplier<T> work) {
		TransactionTemplate ro = new TransactionTemplate(tx.getTransactionManager());
		ro.setReadOnly(true);
		return ro.execute(s -> work.get());
	}

	private static UUID customer() {
		CurrentUser u = CurrentUser.require();
		if (u.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "CUSTOMERS_ONLY", "Staff handle problems in Admin → Problems.");
		}
		return u.id();
	}
}
