package et.tenapay.shop.live;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;

/** The live stream for the signed-in person: new messages, typing, read receipts and notifications. */
@RestController
@RequestMapping("/api/live")
@RequiredArgsConstructor
public class LiveController {

	private final LiveHub hub;

	@GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter stream() {
		return hub.open(CurrentUser.require().id());
	}
}
