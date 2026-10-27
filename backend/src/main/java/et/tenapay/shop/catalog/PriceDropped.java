package et.tenapay.shop.catalog;

import java.math.BigDecimal;

/** Published after a listing's price went down (favourites tell the people who hearted it). */
public record PriceDropped(Long productId, BigDecimal oldPrice, BigDecimal newPrice) {
}
