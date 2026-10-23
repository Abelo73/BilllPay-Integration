package et.tenapay.shop.media;

import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/** Serves stored media (product photos) so the bucket itself never has to be public. */
@RestController
@RequiredArgsConstructor
public class MediaController {

	private static final String PREFIX = "/api/media/";
	/** Keys we generate look like products/42/3f2a…-l.jpg; anything else is refused. */
	private static final Pattern SAFE_KEY = Pattern.compile("^[a-z]+/[0-9]+/[a-z0-9-]+\\.(jpg|webp|png)$");

	private final MediaStorage storage;

	@GetMapping(PREFIX + "**")
	public ResponseEntity<StreamingResponseBody> get(HttpServletRequest request) {
		String key = request.getRequestURI().substring(request.getContextPath().length() + PREFIX.length());
		if (!SAFE_KEY.matcher(key).matches()) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
		}
		return storage.get(key)
				.map(obj -> {
					StreamingResponseBody body = out -> {
						try (InputStream in = obj.content()) {
							in.transferTo(out);
						} catch (IOException e) {
							// client went away mid-download; nothing to do
						}
					};
					return ResponseEntity.ok()
							.contentType(obj.contentType() != null ? MediaType.parseMediaType(obj.contentType())
									: MediaType.APPLICATION_OCTET_STREAM)
							.contentLength(obj.length())
							.header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
							.eTag(obj.etag())
							.body(body);
				})
				.orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
	}
}
