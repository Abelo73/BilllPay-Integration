package et.tenapay.shop.favourite;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.CatalogController.ProductDto;
import et.tenapay.shop.catalog.PriceDropped;
import et.tenapay.shop.catalog.Product;
import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.inbox.InboxItem;
import et.tenapay.shop.inbox.InboxService;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Favourites (the heart): keep listings to come back to; hear when one gets cheaper. */
@Slf4j
@RestController
@RequiredArgsConstructor
public class FavouriteController {

	static final int MAX = 200;

	private final FavouriteRepository favourites;
	private final ProductRepository products;

	/** {@code product} null when the listing is gone; {@code inStore} false when it's hidden or sold out. */
	public record FavouriteView(Long productId, ProductDto product, boolean inStore, BigDecimal priceWhenSaved, Instant savedAt) {
	}

	@GetMapping("/api/me/favourites")
	@Transactional(readOnly = true)
	public List<FavouriteView> mine() {
		UUID me = CurrentUser.require().id();
		return favourites.findByUserIdOrderByCreatedAtDesc(me).stream().map(f -> {
			Product p = products.findWithCategoryById(f.getProductId()).orElse(null);
			boolean visible = p != null && p.sellable() && p.getCategory().isActive() && p.available() > 0;
			return new FavouriteView(f.getProductId(), p == null ? null : ProductDto.from(p), visible, f.getPriceWhenSaved(), f.getCreatedAt());
		}).toList();
	}

	/** Just the ids, for drawing filled hearts on cards. */
	@GetMapping("/api/me/favourites/ids")
	@Transactional(readOnly = true)
	public List<Long> ids() {
		return favourites.findByUserIdOrderByCreatedAtDesc(CurrentUser.require().id()).stream().map(Favourite::getProductId).toList();
	}

	@PutMapping("/api/me/favourites/{productId}")
	@Transactional
	public Map<String, Object> add(@PathVariable Long productId) {
		UUID me = CurrentUser.require().id();
		Product p = products.findVisibleById(productId).orElseThrow(() -> ApiException.notFound("Product"));
		if (favourites.findByUserIdAndProductId(me, productId).isEmpty()) {
			if (favourites.countByUserId(me) >= MAX) {
				throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_FAVOURITES", "You can keep up to " + MAX + " favourites. Remove some first.");
			}
			Favourite f = new Favourite();
			f.setUserId(me);
			f.setProductId(productId);
			f.setPriceWhenSaved(p.getPrice());
			try {
				favourites.saveAndFlush(f);
			} catch (DataIntegrityViolationException twice) {
				// saved by a second tap at the same moment: fine
			}
		}
		return Map.of("productId", productId, "favourite", true);
	}

	@DeleteMapping("/api/me/favourites/{productId}")
	@Transactional
	public Map<String, Object> remove(@PathVariable Long productId) {
		favourites.remove(CurrentUser.require().id(), productId);
		return Map.of("productId", productId, "favourite", false);
	}

	/** After a seller (or staff) lowered a price: everyone who hearted it gets a note. */
	@Component
	@RequiredArgsConstructor
	static class PriceDropAlerts {

		private final FavouriteRepository favourites;
		private final ProductRepository products;
		private final InboxService inbox;

		/** Runs after the price change is saved, in its own transaction (writes in the finished one would be lost). */
		@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
		@Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
		public void onPriceDropped(PriceDropped e) {
			Product p = products.findById(e.productId()).orElse(null);
			if (p == null || !p.sellable()) {
				return;
			}
			String now = e.newPrice().stripTrailingZeros().toPlainString();
			String was = e.oldPrice().stripTrailingZeros().toPlainString();
			for (Favourite f : favourites.findByProductId(e.productId())) {
				inbox.notify(f.getUserId(), InboxItem.Kind.ALERT, "Cheaper now: " + p.getName(),
						"Now " + now + " birr (was " + was + ").", "/product/" + p.getSlug(), "price:" + p.getId() + ":" + now + ":" + f.getUserId());
			}
		}
	}
}
