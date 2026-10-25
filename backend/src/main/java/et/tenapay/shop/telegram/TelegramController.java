package et.tenapay.shop.telegram;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;

/** The bot's webhook, and linking Telegram to your account. */
@RestController
@RequiredArgsConstructor
public class TelegramController {

	private final TelegramService telegram;

	private static UUID me() {
		return CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Please sign in."));
	}

	/** Telegram calls this for every message to the bot. Answers 404 unless the secret header matches. */
	@PostMapping("/api/telegram/webhook")
	public ResponseEntity<Void> webhook(@RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret,
			@RequestBody JsonNode update) {
		if (!telegram.webhookSecretMatches(secret)) {
			return ResponseEntity.notFound().build();
		}
		telegram.handleUpdate(update);
		return ResponseEntity.ok().build();
	}

	@GetMapping("/api/me/telegram")
	public TelegramService.LinkStatus status() {
		return telegram.status(me());
	}

	@PostMapping("/api/me/telegram/link")
	public TelegramService.LinkStart link() {
		return telegram.startLink(me());
	}

	@DeleteMapping("/api/me/telegram")
	public Map<String, Boolean> unlink() {
		telegram.unlink(me());
		return Map.of("ok", true);
	}
}
