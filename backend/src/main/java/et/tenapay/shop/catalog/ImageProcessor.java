package et.tenapay.shop.catalog;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import et.tenapay.shop.common.ApiException;
import net.coobird.thumbnailator.Thumbnails;
import net.coobird.thumbnailator.geometry.Positions;

/**
 * Turns an uploaded photo into a large (≤ 1200 px) and a square thumbnail (400 px) JPEG. The file is decoded, not
 * trusted by name or MIME type; phone photos are rotated by their EXIF orientation; transparency becomes white.
 */
@Component
public class ImageProcessor {

	public static final int LARGE = 1200;
	public static final int THUMB = 400;
	public static final int MIN_SIDE = 300;
	public static final int MAX_SIDE = 8000;
	private static final Set<String> FORMATS = Set.of("jpeg", "jpg", "png", "webp");

	public record Processed(byte[] large, byte[] thumb, int width, int height) {
	}

	public Processed process(byte[] input) {
		checkFormatAndSize(input);
		try {
			BufferedImage oriented = Thumbnails.of(new ByteArrayInputStream(input)).scale(1.0).asBufferedImage();
			BufferedImage rgb = onWhite(oriented);
			BufferedImage large = Math.max(rgb.getWidth(), rgb.getHeight()) > LARGE
					? Thumbnails.of(rgb).size(LARGE, LARGE).asBufferedImage()
					: rgb;
			BufferedImage thumb = Thumbnails.of(rgb).size(THUMB, THUMB).crop(Positions.CENTER).asBufferedImage();
			return new Processed(jpeg(large, 0.85f), jpeg(thumb, 0.82f), large.getWidth(), large.getHeight());
		} catch (IOException | RuntimeException e) {
			if (e instanceof ApiException api) {
				throw api;
			}
			throw invalid("This image could not be read. Try another JPG, PNG or WebP file.");
		}
	}

	/** Reads only the header: refuses non-images and absurd sizes before decoding pixels. */
	private static void checkFormatAndSize(byte[] input) {
		try (ImageInputStream iis = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
			Iterator<ImageReader> readers = iis == null ? null : ImageIO.getImageReaders(iis);
			if (readers == null || !readers.hasNext()) {
				throw invalid("That file is not an image. Use JPG, PNG or WebP.");
			}
			ImageReader reader = readers.next();
			try {
				String format = reader.getFormatName().toLowerCase(Locale.ROOT);
				if (!FORMATS.contains(format)) {
					throw invalid("Unsupported image type (" + format + "). Use JPG, PNG or WebP.");
				}
				reader.setInput(iis);
				int w = reader.getWidth(0);
				int h = reader.getHeight(0);
				if (w > MAX_SIDE || h > MAX_SIDE) {
					throw invalid("Image is too large (" + w + "×" + h + "). Maximum is " + MAX_SIDE + " px per side.");
				}
				if (Math.min(w, h) < MIN_SIDE) {
					throw invalid("Image is too small (" + w + "×" + h + "). Use at least " + MIN_SIDE + "×" + MIN_SIDE + " px.");
				}
			} finally {
				reader.dispose();
			}
		} catch (IOException e) {
			throw invalid("This image could not be read. Try another JPG, PNG or WebP file.");
		}
	}

	private static BufferedImage onWhite(BufferedImage src) {
		BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
		Graphics2D g = out.createGraphics();
		g.setColor(Color.WHITE);
		g.fillRect(0, 0, src.getWidth(), src.getHeight());
		g.drawImage(src, 0, 0, null);
		g.dispose();
		return out;
	}

	private static byte[] jpeg(BufferedImage img, float quality) throws IOException {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
			writer.setOutput(out);
			ImageWriteParam param = writer.getDefaultWriteParam();
			param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			param.setCompressionQuality(quality);
			param.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);
			writer.write(null, new IIOImage(img, null, null), param);
		} finally {
			writer.dispose();
		}
		return bytes.toByteArray();
	}

	private static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", message);
	}
}
