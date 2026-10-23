package et.tenapay.shop.media;

import java.net.URI;
import java.util.Optional;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import et.tenapay.shop.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

@Slf4j
@Component
public class S3MediaStorage implements MediaStorage, ApplicationRunner {

	private static final String CACHE_FOREVER = "public, max-age=31536000, immutable";

	private final S3Client s3;
	private final String bucket;

	public S3MediaStorage(MediaProperties props) {
		this.bucket = props.bucket();
		this.s3 = S3Client.builder()
				.endpointOverride(URI.create(props.endpoint()))
				.region(Region.of(props.region()))
				.credentialsProvider(StaticCredentialsProvider.create(
						AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
				.forcePathStyle(true) // bucket in the path: works with SeaweedFS, MinIO, R2 and AWS
				// Newer SDKs add CRC checksums by default; not every S3-compatible store accepts them
				.requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
				.responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
				.httpClient(UrlConnectionHttpClient.create())
				.build();
	}

	/** Creates the bucket on startup if needed; a missing store is logged, not fatal. */
	@Override
	public void run(ApplicationArguments args) {
		try {
			s3.headBucket(b -> b.bucket(bucket));
		} catch (S3Exception e) {
			if (e.statusCode() != 404) {
				log.warn("Media bucket {} not accessible: {}", bucket, e.getMessage());
				return;
			}
			try {
				s3.createBucket(b -> b.bucket(bucket));
				log.info("Created media bucket {}", bucket);
			} catch (SdkException ce) {
				log.warn("Could not create media bucket {}: {}", bucket, ce.getMessage());
			}
		} catch (SdkException e) {
			log.warn("Media storage unreachable ({}); photo uploads will fail until it is up", e.getMessage());
		}
	}

	@Override
	public void put(String key, byte[] bytes, String contentType) {
		try {
			s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType).cacheControl(CACHE_FOREVER),
					RequestBody.fromBytes(bytes));
		} catch (SdkException e) {
			throw unavailable(e);
		}
	}

	@Override
	public Optional<StoredObject> get(String key) {
		try {
			ResponseInputStream<GetObjectResponse> in = s3.getObject(b -> b.bucket(bucket).key(key));
			GetObjectResponse meta = in.response();
			return Optional.of(new StoredObject(in, meta.contentType(), meta.contentLength(), meta.eTag()));
		} catch (NoSuchKeyException e) {
			return Optional.empty();
		} catch (S3Exception e) {
			if (e.statusCode() == 404) {
				return Optional.empty();
			}
			throw unavailable(e);
		} catch (SdkException e) {
			throw unavailable(e);
		}
	}

	@Override
	public void delete(String key) {
		try {
			s3.deleteObject(b -> b.bucket(bucket).key(key));
		} catch (SdkException e) {
			// The database row is gone either way; an orphaned object is harmless.
			log.warn("Could not delete media object {}: {}", key, e.getMessage());
		}
	}

	@Override
	public void copy(String sourceKey, String targetKey) {
		try {
			s3.copyObject(b -> b.sourceBucket(bucket).sourceKey(sourceKey)
					.destinationBucket(bucket).destinationKey(targetKey));
		} catch (SdkException e) {
			throw unavailable(e);
		}
	}

	@Override
	public boolean isAvailable() {
		try {
			s3.headBucket(b -> b.bucket(bucket));
			return true;
		} catch (SdkException e) {
			return false;
		}
	}

	private static ApiException unavailable(SdkException e) {
		log.error("Media storage error: {}", e.getMessage());
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_UNAVAILABLE",
				"Photo storage is not reachable right now. Please try again shortly.");
	}
}
