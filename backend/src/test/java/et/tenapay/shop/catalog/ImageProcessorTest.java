package et.tenapay.shop.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.common.ApiException;

class ImageProcessorTest {

	private final ImageProcessor processor = new ImageProcessor();

	private static byte[] image(int w, int h, String format, boolean transparent) throws IOException {
		BufferedImage img = new BufferedImage(w, h, transparent ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		if (!transparent) {
			g.setColor(Color.ORANGE);
			g.fillRect(0, 0, w, h);
		}
		g.setColor(Color.BLUE);
		g.fillOval(w / 4, h / 4, w / 2, h / 2);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, format, out);
		return out.toByteArray();
	}

	private static BufferedImage read(byte[] jpeg) throws IOException {
		return ImageIO.read(new ByteArrayInputStream(jpeg));
	}

	@Test
	void shrinksLargePhotoAndMakesSquareThumbnail() throws IOException {
		ImageProcessor.Processed p = processor.process(image(3000, 2000, "jpg", false));
		BufferedImage large = read(p.large());
		BufferedImage thumb = read(p.thumb());
		assertThat(Math.max(large.getWidth(), large.getHeight())).isEqualTo(ImageProcessor.LARGE);
		assertThat(large.getWidth()).isEqualTo(1200);
		assertThat(large.getHeight()).isEqualTo(800); // aspect ratio kept
		assertThat(thumb.getWidth()).isEqualTo(ImageProcessor.THUMB);
		assertThat(thumb.getHeight()).isEqualTo(ImageProcessor.THUMB);
		assertThat(p.width()).isEqualTo(1200);
	}

	@Test
	void keepsSmallPhotoSizeAndTurnsTransparencyWhite() throws IOException {
		ImageProcessor.Processed p = processor.process(image(600, 500, "png", true));
		BufferedImage large = read(p.large());
		assertThat(large.getWidth()).isEqualTo(600); // never upscaled
		assertThat(new Color(large.getRGB(2, 2))).satisfies(c -> {
			assertThat(c.getRed()).isGreaterThan(240);
			assertThat(c.getGreen()).isGreaterThan(240);
			assertThat(c.getBlue()).isGreaterThan(240);
		});
	}

	@Test
	void rejectsTinyImagesAndNonImages() throws IOException {
		byte[] tiny = image(120, 120, "png", false);
		assertThatThrownBy(() -> processor.process(tiny)).isInstanceOf(ApiException.class).hasMessageContaining("too small");
		byte[] text = "<?php echo 'hi'; ?>".getBytes();
		assertThatThrownBy(() -> processor.process(text)).isInstanceOf(ApiException.class).hasMessageContaining("not an image");
	}

	@Test
	void rejectsOtherImageFormats() throws IOException {
		byte[] bmp = image(400, 400, "bmp", false);
		assertThatThrownBy(() -> processor.process(bmp)).isInstanceOf(ApiException.class).hasMessageContaining("Unsupported");
	}
}
