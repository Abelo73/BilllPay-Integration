package et.tenapay.shop.admin;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.telegram.TelegramGateway;
import et.tenapay.shop.telegram.TelegramService;
import lombok.RequiredArgsConstructor;

/** Telegram bot status for staff; connecting the webhook and posting to the channel are admin-only. */
@RestController
@RequestMapping("/api/admin/telegram")
@RequiredArgsConstructor
public class TelegramAdminController {

	private final TelegramService telegram;

	@GetMapping
	public TelegramService.AdminStatus status() {
		return telegram.adminStatus();
	}

	@PostMapping("/webhook")
	public Map<String, Boolean> connectWebhook() {
		TelegramGateway.Result r = telegram.registerWebhook();
		if (!r.ok()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TELEGRAM_WEBHOOK", r.error());
		}
		return Map.of("ok", true);
	}

	@PostMapping("/channel/post-now")
	public Map<String, Integer> postNow() {
		return Map.of("posted", telegram.postNewListings());
	}
}
