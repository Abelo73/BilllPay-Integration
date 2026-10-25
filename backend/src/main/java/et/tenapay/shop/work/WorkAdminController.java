package et.tenapay.shop.work;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Staff: review job posts, run the CV writing queue, and check student IDs (Admin → Jobs, CV orders, Students). */
@RestController
@RequestMapping("/api/admin/work")
@RequiredArgsConstructor
public class WorkAdminController {

	private final JobPostRepository jobs;
	private final TalentProfileRepository profiles;
	private final TalentFileRepository files;
	private final CvOrderRepository cvOrders;
	private final CvOrderFileRepository cvOrderFiles;
	private final JobBoardService board;
	private final CvOrderService cv;
	private final TalentService talent;
	private final WorkFiles store;
	private final WorkController views;

	public record AdminJob(WorkController.JobView job, String status, String statusNote, String employerPhone, String decidedBy,
			Instant decidedAt) {
	}

	public record JobDecision(JobPost.Status status, @Size(max = 500) String note, Boolean markPaid, Boolean featured) {
	}

	public record AdminCvOrder(WorkController.CvOrderView order, String customerName, String customerPhone, Long profileId) {
	}

	public record CvStatus(@NotNull String action, @Size(max = 120) String reference, @Size(max = 120) String writer,
			@Size(max = 1400) String note) {
	}

	public record Student(WorkController.ProfileView profile, String studentStatus, Long idFileId) {
	}

	public record StudentDecision(Boolean approve, @Size(max = 500) String note) {
	}

	public record FeatureTalent(@Min(0) @Max(90) int days) {
	}

	public record Counts(long jobsPending, long cvOrdersOpen, long studentsWaiting) {
	}

	@GetMapping("/counts")
	public Counts counts() {
		return new Counts(jobs.countByStatus(JobPost.Status.PENDING),
				cvOrders.countByStatusIn(EnumSet.of(CvOrder.Status.PAID, CvOrder.Status.WRITING, CvOrder.Status.CHANGES)),
				profiles.countByStudentStatus(TalentProfile.StudentStatus.SUBMITTED));
	}

	// ---------- job posts ----------

	@GetMapping("/jobs")
	@Transactional(readOnly = true)
	public PageDto<AdminJob> jobs(@RequestParam(defaultValue = "PENDING") JobPost.Status status, @RequestParam(defaultValue = "0") int page) {
		Sort sort = status == JobPost.Status.PENDING ? Sort.by("createdAt").ascending() : Sort.by("createdAt").descending();
		return PageDto.of(jobs.findByStatus(status, PageRequest.of(page, 30, sort)).map(this::adminJob));
	}

	@PostMapping("/jobs/{id}")
	public AdminJob decideJob(@PathVariable Long id, @Valid @RequestBody JobDecision r) {
		return adminJob(board.decide(id, r.status(), r.note(), r.markPaid(), r.featured(), by()));
	}

	// ---------- CV orders ----------

	@GetMapping("/cv-orders")
	@Transactional(readOnly = true)
	public PageDto<AdminCvOrder> cvOrders(@RequestParam(defaultValue = "open") String show, @RequestParam(defaultValue = "0") int page) {
		EnumSet<CvOrder.Status> statuses = switch (show) {
			case "unpaid" -> EnumSet.of(CvOrder.Status.AWAITING_PAYMENT);
			case "done" -> EnumSet.of(CvOrder.Status.DONE, CvOrder.Status.CANCELLED);
			default -> EnumSet.of(CvOrder.Status.PAID, CvOrder.Status.WRITING, CvOrder.Status.DRAFT_SENT, CvOrder.Status.CHANGES);
		};
		Sort sort = "done".equals(show) ? Sort.by("createdAt").descending() : Sort.by("createdAt").ascending();
		return PageDto.of(cvOrders.findByStatusIn(statuses, PageRequest.of(page, 30, sort)).map(this::adminOrder));
	}

	/** {@code action}: paid, writing or cancel. */
	@PostMapping("/cv-orders/{id}")
	public AdminCvOrder cvOrderAction(@PathVariable Long id, @Valid @RequestBody CvStatus r) {
		CvOrder o = switch (r.action()) {
			case "paid" -> cv.markPaid(id, r.reference(), by());
			case "writing" -> cv.startWriting(id, TalentService.blank(r.writer()) ? by() : r.writer());
			case "cancel" -> cv.cancel(id, r.note());
			default -> throw TalentService.bad("ACTION_INVALID", "Use paid, writing or cancel.");
		};
		return adminOrder(o);
	}

	/** {@code kind}: DRAFT (sent to the customer for review) or FINAL (order done, copied to their profile). */
	@PostMapping(path = "/cv-orders/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public AdminCvOrder cvOrderFile(@PathVariable Long id, @RequestParam CvOrderFile.Kind kind, @RequestPart("file") MultipartFile file) {
		if (kind == CvOrderFile.Kind.CUSTOMER) {
			throw TalentService.bad("KIND_INVALID", "Upload a DRAFT or a FINAL file.");
		}
		cv.addStaffFile(id, kind, file);
		return adminOrder(cvOrders.findById(id).orElseThrow());
	}

	@GetMapping("/cv-orders/{id}/files/{fileId}")
	public ResponseEntity<byte[]> cvOrderFileDownload(@PathVariable Long id, @PathVariable Long fileId) {
		CvOrderFile f = cvOrderFiles.findById(fileId).filter(x -> x.getOrderId().equals(id)).orElseThrow(() -> ApiException.notFound("File"));
		return store.download(f.getStorageKey(), f.getFileName(), f.getContentType());
	}

	/** The customer's profile, so writers can start from what they already entered. */
	@GetMapping("/profiles/{id}")
	@Transactional(readOnly = true)
	public WorkController.ProfileView profile(@PathVariable Long id) {
		return views.profile(profiles.findById(id).orElseThrow(() -> ApiException.notFound("Profile")), true);
	}

	// ---------- J7 students, J6 featured talent ----------

	@GetMapping("/students")
	@Transactional(readOnly = true)
	public PageDto<Student> students(@RequestParam(defaultValue = "SUBMITTED") TalentProfile.StudentStatus status,
			@RequestParam(defaultValue = "0") int page) {
		return PageDto.of(profiles.findByStudentStatus(status, PageRequest.of(page, 30, Sort.by("updatedAt").ascending()))
				.map(p -> new Student(views.profile(p, true), p.getStudentStatus().name(),
						files.findByProfileIdAndKind(p.getId(), TalentFile.Kind.STUDENT_ID).stream().map(TalentFile::getId)
								.max(Long::compare).orElse(null))));
	}

	@PostMapping("/students/{profileId}")
	public Map<String, Object> decideStudent(@PathVariable Long profileId, @Valid @RequestBody StudentDecision r) {
		TalentProfile p = talent.decideStudent(profileId, Boolean.TRUE.equals(r.approve()), r.note());
		return Map.of("profileId", p.getId(), "studentStatus", p.getStudentStatus().name());
	}

	/** Any profile file (student IDs, CVs), for staff checking a profile. */
	@GetMapping("/files/{fileId}")
	public ResponseEntity<byte[]> profileFile(@PathVariable Long fileId) {
		TalentFile f = files.findById(fileId).orElseThrow(() -> ApiException.notFound("File"));
		return store.download(f.getStorageKey(), f.getFileName(), f.getContentType());
	}

	/** J6: once the person paid, staff put their profile at the top of employers' searches for some days (0 stops it). */
	@PostMapping("/profiles/{id}/feature")
	@Transactional
	public Map<String, Object> featureTalent(@PathVariable Long id, @Valid @RequestBody FeatureTalent r) {
		TalentProfile p = profiles.findById(id).orElseThrow(() -> ApiException.notFound("Profile"));
		p.setFeaturedUntil(r.days() == 0 ? null : Instant.now().plus(Duration.ofDays(r.days())));
		if (r.days() > 0) {
			p.setPublicProfile(true);
		}
		return Map.of("profileId", p.getId(), "featuredUntil", p.getFeaturedUntil() == null ? "" : p.getFeaturedUntil().toString());
	}

	// ---------- helpers ----------

	private AdminJob adminJob(JobPost j) {
		WorkController.JobView v = views.view(j, null, true);
		String phone = profilesPhone(j);
		return new AdminJob(v, j.getStatus().name(), j.getStatusNote(), phone, j.getDecidedBy(), j.getDecidedAt());
	}

	private String profilesPhone(JobPost j) {
		return talent.phoneOfUser(j.getEmployerId());
	}

	private AdminCvOrder adminOrder(CvOrder o) {
		TalentProfile p = profiles.findByUserId(o.getUserId()).orElse(null);
		return new AdminCvOrder(views.order(o), p == null ? null : p.getFullName(), talent.phoneOfUser(o.getUserId()),
				p == null ? null : p.getId());
	}

	private static String by() {
		return CurrentUser.get().map(CurrentUser::email).orElse("staff");
	}
}
