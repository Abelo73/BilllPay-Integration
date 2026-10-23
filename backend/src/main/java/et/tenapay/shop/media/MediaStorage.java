package et.tenapay.shop.media;

import java.io.InputStream;
import java.util.Optional;

/** Object storage for media files. Implemented over the S3 API, so any S3-compatible store works. */
public interface MediaStorage {

	record StoredObject(InputStream content, String contentType, long length, String etag) {
	}

	void put(String key, byte[] bytes, String contentType);

	Optional<StoredObject> get(String key);

	void delete(String key);

	void copy(String sourceKey, String targetKey);

	/** True when the store answers and the bucket exists. */
	boolean isAvailable();
}
