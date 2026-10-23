package et.tenapay.shop.it;

import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.github.tomakehurst.wiremock.WireMockServer;

import et.tenapay.shop.TestcontainersConfiguration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Base for end-to-end tests: the whole app on a random port, real Postgres and Kafka (Testcontainers), and WireMock
 * standing in for BillPay. All test classes share one Spring context, so data is never assumed to be empty; each test
 * creates what it needs with unique names.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
		"billpay.api-key=test-api-key",
		"billpay.webhook.verification=HMAC_SHA256",
		"billpay.webhook.secret=" + IntegrationTest.WEBHOOK_SECRET,
		"billpay.webhook.signature-header=X-Billpay-Signature",
		"billpay.timeout=3s",
		"app.admin-email=" + IntegrationTest.ADMIN_EMAIL,
		"app.admin-password=" + IntegrationTest.ADMIN_PASSWORD,
		"app.jwt-secret=integration-test-jwt-secret-0123456789abcdef",
		"app.redirect-base-url=https://shop.test",
		"app.public-base-url=http://localhost:5280",
		"app.scheduling.enabled=false",
		"app.delivery.flat-fee=150",
		"app.delivery.free-over=3000",
		// no S3 in tests (InMemoryMediaStorage below); point the real client at a closed port so it fails fast
		"media.endpoint=http://127.0.0.1:9",
		"logging.level.et.tenapay.shop=INFO" })
@Import({ TestcontainersConfiguration.class, IntegrationTest.TestBeans.class })
@Testcontainers(disabledWithoutDocker = true)
// tests switch metrics export off by default; we check /actuator/prometheus, so keep it on
@AutoConfigureMetrics
public abstract class IntegrationTest {

	public static final String WEBHOOK_SECRET = "whsec_integration_test_secret";
	public static final String ADMIN_EMAIL = "admin@it.test";
	public static final String ADMIN_PASSWORD = "Admin-pass-2026";

	protected static final WireMockServer billPay = new WireMockServer(options().dynamicPort().templatingEnabled(true)
			.globalTemplating(false));

	/** A real SMTP server with an inbox API, so tests read the emails customers would get. */
	protected static final org.testcontainers.containers.GenericContainer<?> mailpit =
			new org.testcontainers.containers.GenericContainer<>(org.testcontainers.utility.DockerImageName.parse("axllent/mailpit:v1.27"))
					.withExposedPorts(1025, 8025)
					.waitingFor(org.testcontainers.containers.wait.strategy.Wait.forHttp("/livez").forPort(8025));

	static {
		billPay.start();
		Runtime.getRuntime().addShutdownHook(new Thread(billPay::stop));
		mailpit.start();
	}

	@DynamicPropertySource
	static void externalServices(DynamicPropertyRegistry registry) {
		registry.add("billpay.base-url", billPay::baseUrl);
		registry.add("spring.mail.host", mailpit::getHost);
		registry.add("spring.mail.port", () -> mailpit.getMappedPort(1025));
		registry.add("app.mail.inbox-url", IntegrationTest::mailpitApi);
	}

	protected static String mailpitApi() {
		return "http://" + mailpit.getHost() + ":" + mailpit.getMappedPort(8025);
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class TestBeans {
		@Bean
		@Primary
		InMemoryMediaStorage inMemoryMediaStorage() {
			return new InMemoryMediaStorage();
		}
	}

	@Value("${local.server.port}")
	private int port;

	@Autowired
	protected ObjectMapper json;

	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	@BeforeEach
	void resetBillPay() {
		billPay.resetAll();
	}

	// ---------- HTTP ----------

	public record Res(int status, String raw, JsonNode body) {
		public String text(String field) {
			JsonNode n = body == null ? null : body.path(field);
			return n == null || n.isMissingNode() || n.isNull() ? null : n.asString();
		}
	}

	protected Res get(String path, String token) {
		return send(HttpRequest.newBuilder(uri(path)).GET(), token);
	}

	protected Res get(String path) {
		return get(path, null);
	}

	protected Res post(String path, Object body, String token) {
		return send(jsonRequest(path, body).POST(HttpRequest.BodyPublishers.ofString(toJson(body))), token);
	}

	protected Res post(String path, Object body) {
		return post(path, body, null);
	}

	protected Res put(String path, Object body, String token) {
		return send(jsonRequest(path, body).PUT(HttpRequest.BodyPublishers.ofString(toJson(body))), token);
	}

	protected Res patch(String path, Object body, String token) {
		return send(jsonRequest(path, body).method("PATCH", HttpRequest.BodyPublishers.ofString(toJson(body))), token);
	}

	protected Res delete(String path, String token) {
		return send(HttpRequest.newBuilder(uri(path)).DELETE(), token);
	}

	/** Raw POST with exact body and headers (webhooks must be signed over the exact bytes). */
	protected Res postRaw(String path, String body, Map<String, String> headers) {
		HttpRequest.Builder b = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body));
		headers.forEach(b::header);
		return send(b, null);
	}

	protected Res upload(String path, String fileName, String contentType, byte[] bytes, String token) {
		String boundary = "----tenashop" + UUID.randomUUID();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + fileName
				+ "\"\r\nContent-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
		out.writeBytes(bytes);
		out.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
		return send(HttpRequest.newBuilder(uri(path)).header("Content-Type", "multipart/form-data; boundary=" + boundary)
				.POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())), token);
	}

	protected HttpResponse<byte[]> getBytes(String path) {
		try {
			return http.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private HttpRequest.Builder jsonRequest(String path, Object body) {
		return HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
	}

	private Res send(HttpRequest.Builder b, String token) {
		if (token != null) {
			b.header("Authorization", "Bearer " + token);
		}
		try {
			HttpResponse<String> r = http.send(b.timeout(Duration.ofSeconds(30)).build(),
					HttpResponse.BodyHandlers.ofString());
			JsonNode node = null;
			if (r.body() != null && !r.body().isBlank()) {
				try {
					node = json.readTree(r.body());
				} catch (RuntimeException notJson) {
					// leave body null
				}
			}
			return new Res(r.statusCode(), r.body(), node);
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private URI uri(String path) {
		return URI.create(baseUrl() + path);
	}

	protected String baseUrl() {
		return "http://localhost:" + port;
	}

	protected String toJson(Object body) {
		return body instanceof String s ? s : json.writeValueAsString(body);
	}

	// ---------- sign-in ----------

	protected String adminToken() {
		return login("/api/admin/auth/login", ADMIN_EMAIL, ADMIN_PASSWORD);
	}

	protected String login(String path, String email, String password) {
		Res r = post(path, Map.of("email", email, "password", password));
		if (r.status() != 200) {
			throw new AssertionError("sign-in failed for " + email + ": " + r.status() + " " + r.raw());
		}
		return r.body().path("token").asString();
	}

	protected static String unique(String prefix) {
		return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
	}

	// ---------- catalog fixtures ----------

	/** Creates a visible product in a new category and returns its id. */
	protected long createProduct(String token, BigDecimal price, int stock) {
		String name = unique("IT Product");
		Res cats = post("/api/admin/categories", Map.of("name", unique("IT Cat")), token);
		JsonNode categories = cats.body();
		long categoryId = categories.get(categories.size() - 1).path("id").asLong();
		Map<String, Object> req = new LinkedHashMap<>();
		req.put("name", name);
		req.put("categoryId", categoryId);
		req.put("price", price);
		req.put("stock", stock);
		req.put("lowStockThreshold", 2);
		req.put("active", true);
		Res r = post("/api/admin/products", req, token);
		if (r.status() != 200) {
			throw new AssertionError("create product failed: " + r.status() + " " + r.raw());
		}
		return r.body().path("product").path("id").asLong();
	}

	/** Checkout body with a delivery address in Addis Ababa. */
	protected static Map<String, Object> checkoutBody(long productId, int quantity, String phone) {
		return Map.of(
				"items", java.util.List.of(Map.of("productId", productId, "quantity", quantity)),
				"customer", Map.of("name", "Test Buyer", "phone", phone, "email", "buyer@it.test"),
				"delivery", Map.of("address", "Bole, Atlas area, house 12", "city", "Addis Ababa", "notes", "Call on arrival"));
	}

	protected JsonNode adminProduct(long id, String token) {
		return get("/api/admin/products/" + id, token).body().path("product");
	}

	// ---------- BillPay webhooks ----------

	/** Signs like BillPay: X-Billpay-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">. */
	protected static String signature(String body, String secret) {
		try {
			String t = String.valueOf(System.currentTimeMillis() / 1000);
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
			return "t=" + t + ",v1=" + HexFormat.of().formatHex(mac.doFinal((t + "." + body).getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	protected Res sendWebhook(String body) {
		return postRaw("/api/webhooks/billpay", body, Map.of("X-Billpay-Signature", signature(body, WEBHOOK_SECRET),
				"X-Billpay-Event", "PaymentCaptured"));
	}
}
