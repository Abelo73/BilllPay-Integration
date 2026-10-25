package et.tenapay.shop.work;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.media.MediaStorage;
import lombok.RequiredArgsConstructor;

/**
 * Private files for jobs and CVs (CVs, certificates, student IDs, CV orders). Only PDF, JPG, PNG and WebP, up to
 * 5 MB, checked by their content; photos are re-encoded (camera data dropped). Stored under private/, which the public
 * photo route never serves; read back only through the owner's (or staff's) own endpoints, never cached.
 */
@Component
@RequiredArgsConstructor
public class WorkFiles {

	public static final int MAX_BYTES = 5 * 1024 * 1024;

	private final MediaStorage storage;
	private final ImageProcessor images;

	public record Stored(String key, String fileName, String contentType, int size) {
	}

	public Stored store(String folder, MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Choose a file to upload.");
		}
		if (file.getSize() > MAX_BYTES) {
			throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_BIG", "Files can be up to 5 MB.");
		}
		byte[] bytes;
		try {
			bytes = file.getBytes();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		String name = cleanName(file.getOriginalFilename());
		String key = "private/work/" + folder + "/" + UUID.randomUUID();
		if (isPdf(bytes)) {
			storage.put(key + ".pdf", bytes, "application/pdf");
			return new Stored(key + ".pdf", name.toLowerCase().endsWith(".pdf") ? name : name + ".pdf", "application/pdf", bytes.length);
		}
		if (isDocx(bytes, name)) {
			String type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
			storage.put(key + ".docx", bytes, type);
			return new Stored(key + ".docx", name, type, bytes.length);
		}
		ImageProcessor.Processed img = images.process(bytes); // refuses anything that isn't a real photo
		storage.put(key + ".jpg", img.large(), "image/jpeg");
		return new Stored(key + ".jpg", name.replaceAll("\\.[A-Za-z0-9]+$", "") + ".jpg", "image/jpeg", img.large().length);
	}

	public ResponseEntity<byte[]> download(String key, String fileName, String contentType) {
		MediaStorage.StoredObject obj = storage.get(key).orElseThrow(() -> ApiException.notFound("File"));
		try (InputStream in = obj.content()) {
			return ResponseEntity.ok()
					.contentType(MediaType.parseMediaType(contentType))
					.cacheControl(CacheControl.noStore())
					.header("Content-Disposition", ContentDisposition.inline().filename(fileName, java.nio.charset.StandardCharsets.UTF_8).build().toString())
					.body(in.readAllBytes());
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	public void delete(String key) {
		storage.delete(key);
	}

	private static boolean isPdf(byte[] b) {
		return b.length > 4 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F';
	}

	/** Word files are zip archives; only accepted with a .docx name (staff upload the final CV in Word too). */
	private static boolean isDocx(byte[] b, String name) {
		return name.toLowerCase().endsWith(".docx") && b.length > 4 && b[0] == 'P' && b[1] == 'K' && b[2] == 3 && b[3] == 4;
	}

	private static String cleanName(String original) {
		String n = original == null || original.isBlank() ? "file" : original.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
		return n.length() > 120 ? n.substring(n.length() - 120) : n;
	}
}
