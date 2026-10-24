package et.tenapay.shop.inbox;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.inbox.InboxService.Inbox;
import et.tenapay.shop.inbox.InboxService.Prefs;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;

/** The signed-in customer's notifications and SMS choices. */
@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class InboxController {

	private final InboxService inbox;

	public record ReadRequest(Long id) {
	}

	private static UUID me() {
		return CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Please sign in."));
	}

	@GetMapping("/inbox")
	public Inbox list(@RequestParam(defaultValue = "0") int page) {
		return inbox.list(me(), page);
	}

	@GetMapping("/inbox/unread")
	public Map<String, Long> unread() {
		return Map.of("unread", inbox.unread(me()));
	}

	/** Marks one notification read, or all of them when {@code id} is missing. */
	@PostMapping("/inbox/read")
	public Map<String, Boolean> read(@RequestBody(required = false) ReadRequest req) {
		inbox.markRead(me(), req == null ? null : req.id());
		return Map.of("ok", true);
	}

	@GetMapping("/notification-prefs")
	public Prefs prefs() {
		return inbox.prefs(me());
	}

	@PutMapping("/notification-prefs")
	public Prefs savePrefs(@RequestBody Prefs prefs) {
		return inbox.savePrefs(me(), prefs);
	}
}
