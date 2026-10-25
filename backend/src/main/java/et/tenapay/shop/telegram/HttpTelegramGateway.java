package et.tenapay.shop.telegram;

import java.net.http.HttpClient;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The real Bot API: {@code POST https://api.telegram.org/bot<token>/<method>} with a JSON body. */
@Slf4j
class HttpTelegramGateway implements TelegramGateway {

	private final RestClient http;
	private final ObjectMapper json;

	HttpTelegramGateway(TelegramProperties props, ObjectMapper json) {
		this.json = json;
		HttpClient client = HttpClient.newBuilder().connectTimeout(props.timeoutOrDefault()).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(props.timeoutOrDefault());
		this.http = RestClient.builder().baseUrl(props.baseUrlOrDefault() + "/bot" + props.token().trim()).requestFactory(factory)
				.build();
	}

	@Override
	public boolean delivers() {
		return true;
	}

	@Override
	public Result sendMessage(String chatId, String html, Button button) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("chat_id", chatId);
		body.put("text", html);
		body.put("parse_mode", "HTML");
		body.put("link_preview_options", Map.of("is_disabled", button == null));
		if (button != null) {
			body.put("reply_markup", Map.of("inline_keyboard", List.of(List.of(Map.of("text", button.text(), "url", button.url())))));
		}
		return call("sendMessage", body);
	}

	@Override
	public Result setWebhook(String url, String secret) {
		return call("setWebhook", Map.of("url", url, "secret_token", secret, "allowed_updates", List.of("message")));
	}

	private Result call(String method, Map<String, Object> body) {
		try {
			String reply = http.post().uri("/" + method).contentType(MediaType.APPLICATION_JSON).body(body).retrieve()
					.onStatus(s -> true, (req, res) -> { }) // read the body ourselves for every status
					.body(String.class);
			JsonNode node = json.readTree(reply == null ? "{}" : reply);
			if (node.path("ok").asBoolean(false)) {
				return Result.success();
			}
			String error = node.path("description").asString("No reply from Telegram");
			log.warn("Telegram {} failed: {}", method, error);
			return Result.failed(error);
		} catch (Exception e) {
			// never log the URL: it contains the token
			log.warn("Telegram {} could not be reached: {}", method, e.getClass().getSimpleName());
			return Result.failed("Could not reach Telegram");
		}
	}
}
