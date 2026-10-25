package et.tenapay.shop.dispute;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin → Problems: read both sides, write to them, and settle (refund, part refund or pay the seller). */
@RestController
@RequestMapping("/api/admin/disputes")
@RequiredArgsConstructor
public class DisputeAdminController {

	private final DisputeService service;
	private final DisputeViews views;
	private final DisputeRepository disputes;
	private final TransactionTemplate tx;

	public record DecisionRequest(DisputeService.Outcome outcome, @DecimalMax("10000000") BigDecimal amount,
			@Size(max = 1000) String note) {
	}

	public record MessageRequest(@Size(max = 2000) String body) {
	}

	/** {@code show}: open (oldest first) or closed (newest first). */
	@GetMapping
	public PageDto<DisputeViews.DisputeRow> list(@RequestParam(defaultValue = "open") String show, @RequestParam(defaultValue = "0") int page) {
		boolean open = !"closed".equals(show);
		EnumSet<Dispute.Status> statuses = open ? EnumSet.of(Dispute.Status.OPEN) : EnumSet.complementOf(EnumSet.of(Dispute.Status.OPEN));
		Sort sort = open ? Sort.by("createdAt").ascending() : Sort.by("resolvedAt").descending();
		return read(() -> PageDto.of(disputes.findByStatusIn(statuses, PageRequest.of(page, 30, sort)).map(views::row)));
	}

	@GetMapping("/count")
	public Map<String, Long> count() {
		return Map.of("open", disputes.countByStatus(Dispute.Status.OPEN));
	}

	@GetMapping("/{id}")
	public DisputeViews.DisputeView get(@PathVariable Long id) {
		return read(() -> views.view(find(id), DisputeService.Viewer.STAFF));
	}

	@PostMapping("/{id}/messages")
	public DisputeViews.DisputeView message(@PathVariable Long id, @Valid @RequestBody MessageRequest r) {
		service.message(find(id), DisputeService.Viewer.STAFF, "Sodo Gebeya", r.body());
		return get(id);
	}

	@PostMapping("/{id}/decision")
	public DisputeViews.DisputeView decide(@PathVariable Long id, @Valid @RequestBody DecisionRequest r) {
		service.decide(id, r.outcome(), r.amount(), r.note(), CurrentUser.get().map(CurrentUser::email).orElse("staff"));
		return get(id);
	}

	@GetMapping("/{id}/photos/{photoId}")
	public ResponseEntity<byte[]> photo(@PathVariable Long id, @PathVariable Long photoId) {
		return service.photo(find(id), photoId);
	}

	private Dispute find(Long id) {
		return disputes.findById(id).orElseThrow(() -> ApiException.notFound("Problem"));
	}

	private <T> T read(Supplier<T> work) {
		TransactionTemplate ro = new TransactionTemplate(tx.getTransactionManager());
		ro.setReadOnly(true);
		return ro.execute(s -> work.get());
	}
}
