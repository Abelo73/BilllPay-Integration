package et.tenapay.shop.services;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.services.JobService.JobInput;
import et.tenapay.shop.services.JobService.JobView;
import et.tenapay.shop.services.ProService.ProCard;
import et.tenapay.shop.services.ProService.ProDetail;
import et.tenapay.shop.services.ProService.ProInput;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.Role;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Hire a pro: browse pros, manage your own pro profile, post jobs, send quotes; staff approve pros. */
@RestController
@RequiredArgsConstructor
public class ServicesController {

	private final ProService pros;
	private final JobService jobs;

	public record QuoteRequest(BigDecimal price, @Size(max = 1000) String message, @Size(max = 120) String available) {
	}

	public record DoneRequest(@Min(1) @Max(5) int rating, @Size(max = 1000) String review) {
	}

	public record DecisionRequest(ProProfile.Status status, @Size(max = 500) String note) {
	}

	public record JobRequestBody(ProProfile.Trade trade, @Size(max = 2000) String description, @Size(max = 200) String area,
			JobRequest.Timing timing, LocalDate preferredDate, BigDecimal budget, Long proId) {
	}

	private static UUID customer() {
		return CurrentUser.customerId().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
				"Please sign in with a customer account."));
	}

	private static byte[] bytes(MultipartFile file) throws IOException {
		if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_IMAGE", "Send a JPG, PNG or WebP photo up to 5 MB.");
		}
		return file.getBytes();
	}

	// ---------- browse ----------

	@GetMapping("/api/pros")
	public PageDto<ProCard> search(@RequestParam(required = false) ProProfile.Trade trade, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "0") int page) {
		return pros.search(trade, q, page);
	}

	@GetMapping("/api/pros/{id}")
	public ProDetail pro(@PathVariable Long id) {
		boolean staff = CurrentUser.get().map(u -> u.role() == Role.ADMIN || u.role() == Role.SUPPORT).orElse(false);
		return pros.get(id, CurrentUser.customerId().orElse(null), staff);
	}

	@GetMapping("/api/pros/trades")
	public List<String> trades() {
		return java.util.Arrays.stream(ProProfile.Trade.values()).map(Enum::name).toList();
	}

	// ---------- my pro profile ----------

	@GetMapping("/api/me/pro")
	public Map<String, Object> myPro() {
		ProDetail d = pros.mine(customer());
		return d == null ? Map.of("exists", false) : Map.of("exists", true, "profile", d);
	}

	@PutMapping("/api/me/pro")
	public ProDetail saveMyPro(@RequestBody ProInput in) {
		return pros.save(customer(), in);
	}

	@PostMapping(path = "/api/me/pro/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProService.Photo addPhoto(@RequestPart("file") MultipartFile file) throws IOException {
		return pros.addPhoto(customer(), bytes(file));
	}

	@DeleteMapping("/api/me/pro/photos/{id}")
	public Map<String, Boolean> deletePhoto(@PathVariable Long id) {
		pros.deletePhoto(customer(), id);
		return Map.of("deleted", true);
	}

	// ---------- jobs (customer) ----------

	@PostMapping("/api/jobs")
	public JobView postJob(@RequestBody JobRequestBody b) {
		return jobs.create(customer(), new JobInput(b.trade(), b.description(), b.area(), b.timing(), b.preferredDate(), b.budget(), b.proId()));
	}

	@GetMapping("/api/jobs/mine")
	public PageDto<JobView> myJobs(@RequestParam(defaultValue = "0") int page) {
		return jobs.mine(customer(), page);
	}

	@GetMapping("/api/jobs/{id}")
	public JobView job(@PathVariable Long id) {
		return jobs.get(customer(), id);
	}

	@PostMapping(path = "/api/jobs/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public Map<String, String> jobPhoto(@PathVariable Long id, @RequestPart("file") MultipartFile file) throws IOException {
		return Map.of("url", jobs.addPhoto(customer(), id, bytes(file)));
	}

	@PostMapping("/api/jobs/{id}/accept/{quoteId}")
	public JobView accept(@PathVariable Long id, @PathVariable Long quoteId) {
		return jobs.accept(customer(), id, quoteId);
	}

	@PostMapping("/api/jobs/{id}/cancel")
	public JobView cancel(@PathVariable Long id) {
		return jobs.cancel(customer(), id);
	}

	@PostMapping("/api/jobs/{id}/done")
	public JobView done(@PathVariable Long id, @RequestBody DoneRequest req) {
		return jobs.done(customer(), id, req.rating(), req.review());
	}

	// ---------- jobs (pro) ----------

	@GetMapping("/api/pro/jobs")
	public JobService.ProInbox proJobs(@RequestParam(defaultValue = "0") int page) {
		return jobs.proInbox(customer(), page);
	}

	@PostMapping("/api/jobs/{id}/quotes")
	public JobView sendQuote(@PathVariable Long id, @RequestBody QuoteRequest req) {
		return jobs.quote(customer(), id, req.price(), req.message(), req.available());
	}

	@PostMapping("/api/jobs/{id}/quotes/withdraw")
	public JobView withdrawQuote(@PathVariable Long id) {
		return jobs.withdraw(customer(), id);
	}

	// ---------- staff ----------

	@GetMapping("/api/admin/pros")
	public PageDto<ProDetail> adminPros(@RequestParam(required = false) ProProfile.Status status, @RequestParam(defaultValue = "0") int page) {
		return pros.adminList(status, page);
	}

	@PostMapping("/api/admin/pros/{id}/decision")
	public ProDetail decide(@PathVariable Long id, @RequestBody DecisionRequest req) {
		String staff = CurrentUser.get().map(u -> u.email() != null ? u.email() : u.id().toString()).orElse("staff");
		return pros.decide(id, req.status(), req.note(), staff);
	}
}
