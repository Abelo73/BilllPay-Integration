package et.tenapay.shop.admin;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.chat.ChatService;
import et.tenapay.shop.chat.ChatService.ReportView;
import et.tenapay.shop.chat.ChatService.Thread;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Staff: reported chats. Only reported conversations can be opened here; the rest stay private. */
@RestController
@RequestMapping("/api/admin/chat-reports")
@RequiredArgsConstructor
public class ChatReportAdminController {

	private final ChatService chat;

	public record ResolveRequest(@Size(max = 500) String resolution, boolean blockConversation) {
	}

	public record ReportDetail(ReportView report, Thread thread) {
	}

	@GetMapping
	public PageDto<ReportView> list(@RequestParam(required = false) String status, @RequestParam(defaultValue = "0") int page) {
		return chat.reports(status, page);
	}

	@GetMapping("/{id}")
	public ReportDetail get(@PathVariable Long id) {
		return new ReportDetail(chat.report(id), chat.reportedThread(id));
	}

	@PostMapping("/{id}/resolve")
	public ReportView resolve(@PathVariable Long id, @RequestBody ResolveRequest req) {
		String staff = CurrentUser.get().map(u -> u.email() != null ? u.email() : u.id().toString()).orElse("staff");
		return chat.resolve(id, req.resolution(), req.blockConversation(), staff);
	}
}
