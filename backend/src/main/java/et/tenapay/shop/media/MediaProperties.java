package et.tenapay.shop.media;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media")
public record MediaProperties(String endpoint, String region, String bucket, String accessKey, String secretKey,
		String publicPath) {

	/** URL the browser uses for a stored object (served through MediaController). */
	public String urlFor(String key) {
		return publicPath + "/" + key;
	}
}
