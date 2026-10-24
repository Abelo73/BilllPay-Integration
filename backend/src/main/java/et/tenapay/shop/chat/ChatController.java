package et.tenapay.shop.chat;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.chat.ChatService.ConversationView;
import et.tenapay.shop.chat.ChatService.MessageView;
import et.tenapay.shop.chat.ChatService.OfferView;
import et.tenapay.shop.chat.ChatService.Thread;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Chat for signed-in customers: as a buyer, and as the owner of a shop. */
@RestController
@RequestMapping("/api/chats")
@RequiredArgsConstructor
public class ChatController {

	private final ChatService chat;

	public record StartRequest(@NotNull Long productId, @Size(max = 2000) String text) {
	}

	public record TextRequest(@Size(max = 2000) String text) {
	}

	public record OfferRequest(Long productId, @NotNull BigDecimal unitPrice, @Min(1) @Max(20) Integer quantity) {
	}

	public record BlockRequest(boolean blocked) {
	}

	public record ReportRequest(ChatReport.Reason reason, @Size(max = 500) String details) {
	}

	private static UUID me() {
		return CurrentUser.customerId().orElseThrow(() -> CurrentUser.get().isPresent()
				? new ApiException(HttpStatus.FORBIDDEN, "CUSTOMERS_ONLY", "Chat is for customer accounts.")
				: new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Please sign in to chat."));
	}

	@GetMapping
	public PageDto<ConversationView> list(@RequestParam(defaultValue = "all") String filter,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
		return chat.list(me(), filter, page, size);
	}

	@GetMapping("/unread")
	public Map<String, Long> unread() {
		return Map.of("unread", chat.unreadCount(me()));
	}

	/** Opens the conversation with the product's shop (creating it the first time). */
	@PostMapping
	public ConversationView start(@Valid @RequestBody StartRequest req) {
		return chat.start(me(), req.productId(), req.text());
	}

	@GetMapping("/{id}")
	public Thread thread(@PathVariable Long id, @RequestParam(defaultValue = "0") long after) {
		return chat.thread(me(), id, after);
	}

	@PostMapping("/{id}/messages")
	public MessageView send(@PathVariable Long id, @Valid @RequestBody TextRequest req) {
		return chat.sendText(me(), id, req.text());
	}

	@PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public MessageView sendImage(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_IMAGE", "Send a JPG, PNG or WebP photo up to 5 MB.");
		}
		return chat.sendImage(me(), id, file.getBytes());
	}

	@PostMapping("/{id}/offers")
	public MessageView offer(@PathVariable Long id, @Valid @RequestBody OfferRequest req) {
		return chat.makeOffer(me(), id, req.productId(), req.unitPrice(), req.quantity() == null ? 1 : req.quantity());
	}

	@PostMapping("/offers/{offerId}/{action}")
	public OfferView answer(@PathVariable Long offerId, @PathVariable String action) {
		ChatService.OfferAction a;
		try {
			a = ChatService.OfferAction.valueOf(action.toUpperCase());
		} catch (IllegalArgumentException e) {
			throw ApiException.notFound("Action");
		}
		return chat.answerOffer(me(), offerId, a);
	}

	@PostMapping("/{id}/block")
	public Map<String, Boolean> block(@PathVariable Long id, @RequestBody BlockRequest req) {
		chat.block(me(), id, req.blocked());
		return Map.of("blocked", req.blocked());
	}

	@PostMapping("/{id}/report")
	public Map<String, Boolean> report(@PathVariable Long id, @Valid @RequestBody ReportRequest req) {
		chat.report(me(), id, req.reason(), req.details());
		return Map.of("reported", true);
	}
}
