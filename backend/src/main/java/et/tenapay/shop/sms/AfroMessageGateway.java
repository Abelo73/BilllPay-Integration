package et.tenapay.shop.sms;

import java.net.http.HttpClient;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Sends SMS through AfroMessage (https://afromessage.com): {@code GET /api/send} with the API token as a Bearer header.
 * {@code from} is the identifier id and {@code sender} the approved sender name; both are optional, and AfroMessage
 * uses the account's defaults when they're left out. A reply with {@code "acknowledge":"success"} means accepted.
 */
@Slf4j
class AfroMessageGateway implements SmsGateway {

	private final SmsProperties.AfroMessage config;
	private final RestClient http;
	private final ObjectMapper json;

	AfroMessageGateway(SmsProperties props, ObjectMapper json) {
		this.config = props.afromessage();
		this.json = json;
		HttpClient client = HttpClient.newBuilder().connectTimeout(props.timeoutOrDefault()).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(props.timeoutOrDefault());
		String base = config.baseUrl() == null || config.baseUrl().isBlank() ? "https://api.afromessage.com" : config.baseUrl();
		this.http = RestClient.builder().baseUrl(base.replaceAll("/+$", "")).requestFactory(factory)
				.defaultHeader("Authorization", "Bearer " + config.token().trim()).build();
	}

	@Override
	public String name() {
		return "afromessage";
	}

	@Override
	public boolean delivers() {
		return true;
	}

	@Override
	public Result send(String to, String text) {
		try {
			String body = http.get().uri(b -> query(b, to, text)).retrieve()
					.onStatus(s -> true, (req, res) -> { }) // read the body ourselves for every status
					.body(String.class);
			return parse(body);
		} catch (Exception e) {
			log.warn("AfroMessage could not be reached: {}", e.getMessage());
			return Result.failed("Could not reach AfroMessage: " + e.getMessage());
		}
	}

	private java.net.URI query(UriBuilder b, String to, String text) {
		b.path("/api/send").queryParam("to", to).queryParam("message", text);
		if (notBlank(config.identifierId())) {
			b.queryParam("from", config.identifierId());
		}
		if (notBlank(config.sender())) {
			b.queryParam("sender", config.sender());
		}
		if (notBlank(config.callback())) {
			b.queryParam("callback", config.callback());
		}
		return b.build();
	}

	Result parse(String body) {
		if (body == null || body.isBlank()) {
			return Result.failed("Empty reply from AfroMessage");
		}
		try {
			JsonNode node = json.readTree(body);
			if ("success".equalsIgnoreCase(node.path("acknowledge").asString(""))) {
				JsonNode r = node.path("response");
				String ref = r.path("message_id").asString(r.path("messageId").asString(null));
				return Result.ok(ref);
			}
			JsonNode errors = node.path("response").path("errors");
			String error = errors.isArray() && !errors.isEmpty() ? errors.get(0).asString() : body;
			return Result.failed(error.length() > 300 ? error.substring(0, 300) : error);
		} catch (Exception e) {
			return Result.failed("Unexpected reply from AfroMessage: " + (body.length() > 200 ? body.substring(0, 200) : body));
		}
	}

	private static boolean notBlank(String s) {
		return s != null && !s.isBlank();
	}
}
