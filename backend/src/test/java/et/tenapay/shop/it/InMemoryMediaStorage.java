package et.tenapay.shop.it;

import java.io.ByteArrayInputStream;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import et.tenapay.shop.media.MediaStorage;

/** Photo storage for tests: keeps objects in memory instead of S3. */
public class InMemoryMediaStorage implements MediaStorage {

	private record Item(byte[] bytes, String contentType) {
	}

	private final Map<String, Item> objects = new ConcurrentHashMap<>();

	@Override
	public void put(String key, byte[] bytes, String contentType) {
		objects.put(key, new Item(bytes, contentType));
	}

	@Override
	public Optional<StoredObject> get(String key) {
		return Optional.ofNullable(objects.get(key))
				.map(i -> new StoredObject(new ByteArrayInputStream(i.bytes()), i.contentType(), i.bytes().length,
						"\"" + Integer.toHexString(java.util.Arrays.hashCode(i.bytes())) + "\""));
	}

	@Override
	public void delete(String key) {
		objects.remove(key);
	}

	@Override
	public void copy(String sourceKey, String targetKey) {
		Item item = objects.get(sourceKey);
		if (item != null) {
			objects.put(targetKey, item);
		}
	}

	@Override
	public boolean isAvailable() {
		return true;
	}

	public boolean contains(String key) {
		return objects.containsKey(key);
	}
}
