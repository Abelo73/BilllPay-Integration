package et.tenapay.shop.seller;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import lombok.RequiredArgsConstructor;

/** The shop's photo gallery: up to six photos, shown on the public shop page. Only the owner adds or removes them. */
@RestController
@RequiredArgsConstructor
public class ShopGalleryController {

	static final int MAX_PHOTOS = 6;

	private final ShopService shopService;
	private final JdbcTemplate jdbc;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final MediaProperties media;

	public record GalleryPhoto(long id, int position, String url) {
	}

	@GetMapping("/api/seller/shop/photos")
	public List<GalleryPhoto> mine() {
		return list(shopService.requireMine().getId());
	}

	@PostMapping(path = "/api/seller/shop/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Transactional
	public List<GalleryPhoto> add(@RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a photo.");
		}
		Long shopId = shopService.requireMine().getId();
		Integer count = jdbc.queryForObject("select count(*) from shop_photos where shop_id = ?", Integer.class, shopId);
		if (count != null && count >= MAX_PHOTOS) {
			throw new ApiException(HttpStatus.CONFLICT, "GALLERY_FULL", "You can show up to " + MAX_PHOTOS + " photos. Remove one first.");
		}
		ImageProcessor.Processed img = images.process(file.getBytes());
		// shops/<n>/<name>.jpg: the public media route serves this shape
		String key = "shops/" + shopId + "/gallery-" + UUID.randomUUID().toString().toLowerCase() + ".jpg";
		storage.put(key, img.large(), "image/jpeg");
		Integer next = jdbc.queryForObject("select coalesce(max(position), -1) + 1 from shop_photos where shop_id = ?", Integer.class, shopId);
		jdbc.update("insert into shop_photos (shop_id, position, image_key) values (?, ?, ?)", shopId, next, key);
		return list(shopId);
	}

	@DeleteMapping("/api/seller/shop/photos/{id}")
	@Transactional
	public List<GalleryPhoto> remove(@PathVariable long id) {
		Long shopId = shopService.requireMine().getId();
		List<String> keys = jdbc.queryForList("select image_key from shop_photos where id = ? and shop_id = ?", String.class, id, shopId);
		if (keys.isEmpty()) {
			throw ApiException.notFound("Photo");
		}
		jdbc.update("delete from shop_photos where id = ? and shop_id = ?", id, shopId);
		storage.delete(keys.get(0));
		return list(shopId);
	}

	/** The gallery of a shop, in order. Used by the public shop page too. */
	public List<GalleryPhoto> list(long shopId) {
		return jdbc.query("select id, position, image_key from shop_photos where shop_id = ? order by position, id",
				(rs, i) -> new GalleryPhoto(rs.getLong("id"), rs.getInt("position"), media.urlFor(rs.getString("image_key"))), shopId);
	}

	/** Public: the photo URLs for a shop page (empty when the owner has added none). */
	public List<String> publicUrls(long shopId) {
		return list(shopId).stream().map(GalleryPhoto::url).toList();
	}
}
