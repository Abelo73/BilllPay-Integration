package et.tenapay.shop.dispute;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Component;

import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import lombok.RequiredArgsConstructor;

/** How a problem report looks to the buyer, the seller and staff. */
@Component
@RequiredArgsConstructor
public class DisputeViews {

	private final DisputeService service;
	private final DisputePhotoRepository photos;
	private final OrderRepository orders;
	private final OrderParcelRepository parcels;
	private final ShopRepository shops;

	public record MessageView(Long id, String author, String authorName, String body, Instant createdAt) {
	}

	public record ItemLine(String name, int quantity, BigDecimal lineTotal) {
	}

	/** {@code viewer}: BUYER, SELLER or STAFF; {@code buyerPhone} for staff only. */
	public record DisputeView(Long id, String orderNumber, String parcelNumber, int parcelNo, String shopName, String buyerName,
			String buyerPhone, String reason, String details, String status, BigDecimal parcelTotal, BigDecimal refundAmount,
			String decisionNote, String decidedBy, Instant createdAt, Instant resolvedAt, Instant sellerRepliedAt,
			List<ItemLine> items, List<MessageView> messages, List<Long> photoIds, String viewer, boolean canWrite,
			boolean canWithdraw, boolean canAddPhotos) {
	}

	/** A row in a list (no thread). */
	public record DisputeRow(Long id, String orderNumber, String parcelNumber, String shopName, String buyerName, String reason,
			String status, BigDecimal parcelTotal, BigDecimal refundAmount, Instant createdAt, Instant sellerRepliedAt,
			Instant resolvedAt) {
	}

	public DisputeView view(Dispute d, DisputeService.Viewer viewer) {
		Order o = orders.findById(d.getOrderId()).orElseThrow();
		OrderParcel p = parcels.findById(d.getParcelId()).orElseThrow();
		List<ItemLine> items = o.getItems().stream()
				.filter(i -> i.getParcelNo() == null || i.getParcelNo() == p.getParcelNo())
				.map(i -> new ItemLine(i.getProductName(), i.getQuantity(), i.getLineTotal())).toList();
		boolean open = d.getStatus().open();
		List<Long> photoIds = photos.findByDisputeIdOrderByIdAsc(d.getId()).stream().map(DisputePhoto::getId).toList();
		return new DisputeView(d.getId(), o.getOrderNumber(), p.number(o.getOrderNumber()), p.getParcelNo(), shopName(d),
				o.getCustomerName(), viewer == DisputeService.Viewer.STAFF ? o.getCustomerPhone() : null, d.getReason().name(),
				d.getDetails(), d.getStatus().name(), DisputeService.parcelPaid(p), d.getRefundAmount(), d.getDecisionNote(),
				viewer == DisputeService.Viewer.STAFF ? d.getDecidedBy() : null, d.getCreatedAt(), d.getResolvedAt(),
				d.getSellerRepliedAt(), items,
				service.thread(d).stream().map(m -> new MessageView(m.getId(), m.getAuthor().name(), m.getAuthorName(), m.getBody(), m.getCreatedAt()))
						.toList(),
				photoIds, viewer.name(), open, open && viewer == DisputeService.Viewer.BUYER,
				open && viewer == DisputeService.Viewer.BUYER && photoIds.size() < DisputeService.MAX_PHOTOS);
	}

	public DisputeRow row(Dispute d) {
		Order o = orders.findById(d.getOrderId()).orElseThrow();
		OrderParcel p = parcels.findById(d.getParcelId()).orElseThrow();
		return new DisputeRow(d.getId(), o.getOrderNumber(), p.number(o.getOrderNumber()), shopName(d), o.getCustomerName(),
				d.getReason().name(), d.getStatus().name(), DisputeService.parcelPaid(p), d.getRefundAmount(), d.getCreatedAt(),
				d.getSellerRepliedAt(), d.getResolvedAt());
	}

	private String shopName(Dispute d) {
		return d.getShopId() == null ? "Sodo Gebeya" : shops.findById(d.getShopId()).map(Shop::getName).orElse("Seller");
	}
}
