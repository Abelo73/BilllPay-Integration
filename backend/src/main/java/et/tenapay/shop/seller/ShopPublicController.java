package et.tenapay.shop.seller;

import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.ProductRepository;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.seller.ShopViews.PublicShopDto;
import lombok.RequiredArgsConstructor;

/** Shop pages for shoppers. Only approved shops are found; their products come from /api/products?shop=slug. */
@RestController
@RequestMapping("/api/shops")
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShopPublicController {

	private final ShopRepository shops;
	private final ProductRepository products;
	private final MediaProperties media;

	@GetMapping("/{slug}")
	public PublicShopDto get(@PathVariable String slug) {
		Shop shop = shops.findBySlug(slug).filter(s -> s.getStatus().selling())
				.orElseThrow(() -> ApiException.notFound("Shop"));
		long count = products.search(null, null, shop.getId(), PageRequest.of(0, 1)).getTotalElements();
		return PublicShopDto.of(shop, media, count);
	}
}
