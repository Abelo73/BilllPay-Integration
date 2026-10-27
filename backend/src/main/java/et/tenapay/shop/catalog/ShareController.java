package et.tenapay.shop.catalog;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.config.AppProperties;
import lombok.RequiredArgsConstructor;

/**
 * Share links (Telegram, WhatsApp, Facebook): /api/share/p/{slug} answers with the listing's title, price and photo as
 * Open Graph tags, so chat apps show a preview card, and sends people on to the product page.
 */
@RestController
@RequiredArgsConstructor
public class ShareController {

	private final ProductRepository products;
	private final AppProperties app;

	@GetMapping("/api/share/p/{slug}")
	@Transactional(readOnly = true)
	public ResponseEntity<byte[]> product(@PathVariable String slug) {
		String base = app.publicBaseUrl().replaceAll("/+$", "");
		Product p = products.findVisibleBySlug(slug).orElse(null);
		String page = p == null ? base + "/shop" : base + "/product/" + p.getSlug();
		String title = p == null ? "Sodo Gebeya" : p.getName() + " · " + p.getPrice().stripTrailingZeros().toPlainString() + " birr";
		String where = p == null ? null : p.effectiveArea();
		String description = p == null ? "Buy and sell in Wolaita Sodo."
				: (p.getShop() != null ? p.getShop().getName() : "Sodo Gebeya") + (where != null ? " · " + where : "") + " · on Sodo Gebeya";
		String image = p == null || p.getImageUrl() == null ? base + "/brand/og-cover.png"
				: p.getImageUrl().startsWith("http") ? p.getImageUrl() : base + p.getImageUrl();
		String html = """
				<!doctype html>
				<html lang="en"><head><meta charset="utf-8">
				<title>%1$s</title>
				<meta property="og:type" content="product">
				<meta property="og:site_name" content="Sodo Gebeya">
				<meta property="og:title" content="%1$s">
				<meta property="og:description" content="%2$s">
				<meta property="og:image" content="%3$s">
				<meta property="og:url" content="%4$s">
				<meta name="twitter:card" content="summary_large_image">
				<meta http-equiv="refresh" content="0; url=%4$s">
				</head><body><p><a href="%4$s">%1$s</a></p>
				<script>location.replace(%5$s)</script></body></html>
				""".formatted(esc(title), esc(description), esc(image), esc(page), js(page));
		return ResponseEntity.ok().contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
				.cacheControl(CacheControl.maxAge(java.time.Duration.ofMinutes(10)).cachePublic())
				.body(html.getBytes(StandardCharsets.UTF_8));
	}

	private static String esc(String s) {
		return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
	}

	/** A JavaScript string literal (the URL is ours, but quotes and tags are escaped anyway). */
	private static String js(String s) {
		return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("<", "\\u003c").replace(">", "\\u003e") + "\"";
	}
}
