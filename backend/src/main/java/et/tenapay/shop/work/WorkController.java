package et.tenapay.shop.work;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Jobs and CVs for people (J1–J7): the jobs board, my profile and CV, applying, posting jobs, and CV orders. */
@RestController
@RequestMapping("/api/work")
@RequiredArgsConstructor
public class WorkController {

	private final JobPostRepository jobs;
	private final JobApplicationRepository applications;
	private final TalentProfileRepository profiles;
	private final TalentExperienceRepository experience;
	private final TalentFileRepository files;
	private final CvOrderRepository cvOrders;
	private final CvOrderFileRepository cvOrderFiles;
	private final TalentService talent;
	private final JobBoardService board;
	private final CvOrderService cv;
	private final WorkFiles store;
	private final Features features;

	// ---------- views ----------

	public record JobView(Long id, String title, String employerName, String place, String type, String field,
			BigDecimal salaryMin, BigDecimal salaryMax, String salaryNote, String description, String requirements,
			LocalDate deadline, boolean featured, Instant postedAt, String status, String statusNote, BigDecimal fee,
			boolean feePaid, boolean applied, long applications) {
	}

	public record FileView(Long id, String kind, String fileName, String contentType, int sizeBytes, Instant createdAt) {

		static FileView of(TalentFile f) {
			return new FileView(f.getId(), f.getKind().name(), f.getFileName(), f.getContentType(), f.getSizeBytes(), f.getCreatedAt());
		}
	}

	public record ExperienceView(String title, String place, String startMonth, String endMonth, String description) {
	}

	/** The profile, also used to draw the free CV. {@code phone} only for the owner and employers the person applied to. */
	public record ProfileView(Long id, String fullName, String status, String headline, String about, String school,
			String fieldOfStudy, Integer graduationYear, List<String> skills, List<String> languages, List<String> workTypes,
			List<String> workPlaces, boolean publicProfile, String studentStatus, String studentNote, boolean verifiedStudent,
			List<ExperienceView> experience, List<FileView> files, String phone, Instant updatedAt) {
	}

	public record ApplicationView(Long id, String status, String cvKind, Long cvFileId, String message, Instant createdAt,
			JobView job, ProfileView applicant) {
	}

	public record CvOrderFileView(Long id, String kind, String fileName, String contentType, int sizeBytes, Instant createdAt) {

		static CvOrderFileView of(CvOrderFile f) {
			return new CvOrderFileView(f.getId(), f.getKind().name(), f.getFileName(), f.getContentType(), f.getSizeBytes(), f.getCreatedAt());
		}
	}

	public record CvOrderView(Long id, String pack, boolean express, String language, BigDecimal price, int discountPercent,
			BigDecimal total, String status, String targetJob, String details, String paymentReference, String writer,
			int changesAllowed, int changesUsed, String changeRequest, Instant dueAt, Instant paidAt, Instant doneAt,
			Instant createdAt, List<CvOrderFileView> files, String payTo) {
	}

	// ---------- requests ----------

	public record ProfileRequest(@Size(max = 120) String fullName, TalentProfile.Status status, @Size(max = 160) String headline,
			@Size(max = 1500) String about, @Size(max = 160) String school, @Size(max = 160) String fieldOfStudy,
			Integer graduationYear, @Size(max = 30) List<String> skills, @Size(max = 10) List<String> languages,
			List<String> workTypes, List<String> workPlaces, Boolean publicProfile,
			@Size(max = 10) List<TalentService.ExperienceForm> experience) {
	}

	public record JobRequest(@Size(max = 120) String employerName, @Size(max = 140) String title, @Size(max = 120) String place,
			JobPost.Type type, @Size(max = 80) String field, BigDecimal salaryMin, BigDecimal salaryMax,
			@Size(max = 80) String salaryNote, @Size(max = 4000) String description, @Size(max = 2000) String requirements,
			LocalDate deadline) {
	}

	public record ApplyRequest(JobApplication.CvKind cvKind, Long cvFileId, @Size(max = 1000) String message) {
	}

	public record StatusRequest(@NotNull JobApplication.Status status) {
	}

	public record CvOrderRequest(@NotNull CvOrder.Package pack, Boolean express, @Size(max = 10) String language,
			@Size(max = 200) String targetJob, @Size(max = 4000) String details) {
	}

	public record ReferenceRequest(@NotNull @Size(min = 3, max = 120) String reference) {
	}

	public record RespondRequest(Boolean approve, @Size(max = 1500) String changes) {
	}

	// ---------- jobs board (public) ----------

	@GetMapping("/jobs")
	@Transactional(readOnly = true)
	public PageDto<JobView> jobs(@RequestParam(required = false) String q, @RequestParam(required = false) JobPost.Type type,
			@RequestParam(required = false) String place, @RequestParam(defaultValue = "0") int page) {
		features.require(Features.JOB_POSTS);
		UUID me = CurrentUser.get().map(CurrentUser::id).orElse(null);
		return PageDto.of(jobs.searchLive(LocalDate.now(JobBoardService.ADDIS), type, blankToNull(q), blankToNull(place),
				PageRequest.of(page, 20)).map(j -> view(j, me, false)));
	}

	@GetMapping("/jobs/{id}")
	@Transactional(readOnly = true)
	public JobView job(@PathVariable Long id) {
		features.require(Features.JOB_POSTS);
		UUID me = CurrentUser.get().map(CurrentUser::id).orElse(null);
		JobPost j = jobs.findById(id).filter(x -> x.open() || x.getEmployerId().equals(me)).orElseThrow(() -> ApiException.notFound("Job"));
		return view(j, me, j.getEmployerId().equals(me));
	}

	// ---------- my profile and CV ----------

	@GetMapping("/profile")
	@Transactional(readOnly = true)
	public ProfileView myProfile() {
		TalentProfile p = talent.mine(customer());
		if (p == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NO_PROFILE", "Make your free profile first.");
		}
		return profile(p, true);
	}

	@PutMapping("/profile")
	public ProfileView saveProfile(@Valid @RequestBody ProfileRequest r) {
		UUID me = customer();
		talent.save(me, new TalentService.ProfileForm(r.fullName(), r.status(), r.headline(), r.about(), r.school(), r.fieldOfStudy(),
				r.graduationYear(), r.skills(), r.languages(), r.workTypes(), r.workPlaces(), r.publicProfile(), r.experience()));
		return myProfileTx(me);
	}

	@DeleteMapping("/profile")
	public Map<String, Object> deleteProfile() {
		talent.delete(customer());
		return Map.of("deleted", true);
	}

	@PostMapping(path = "/profile/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProfileView addFile(@RequestParam TalentFile.Kind kind, @RequestPart("file") MultipartFile file) {
		UUID me = customer();
		if (kind == TalentFile.Kind.STUDENT_ID) {
			features.require(Features.STUDENT_BADGE);
		}
		talent.addFile(me, kind, file);
		return myProfileTx(me);
	}

	@DeleteMapping("/profile/files/{id}")
	public ProfileView removeFile(@PathVariable Long id) {
		UUID me = customer();
		talent.removeFile(me, id);
		return myProfileTx(me);
	}

	@GetMapping("/profile/files/{id}")
	public ResponseEntity<byte[]> myFile(@PathVariable Long id) {
		TalentProfile p = talent.requireMine(customer());
		TalentFile f = files.findById(id).filter(x -> x.getProfileId().equals(p.getId())).orElseThrow(() -> ApiException.notFound("File"));
		return store.download(f.getStorageKey(), f.getFileName(), f.getContentType());
	}

	/** Another person's profile: public ones for employers browsing talent; private ones only once they applied to you. */
	@GetMapping("/profiles/{id}")
	@Transactional(readOnly = true)
	public ProfileView profileById(@PathVariable Long id) {
		UUID me = customer();
		TalentProfile p = profiles.findById(id).orElseThrow(() -> ApiException.notFound("Profile"));
		if (p.getUserId().equals(me)) {
			return profile(p, true);
		}
		boolean applied = applications.appliedToEmployer(me, p.getId());
		if (!applied && !(p.isPublicProfile() && jobs.countByEmployerId(me) > 0)) {
			throw ApiException.notFound("Profile");
		}
		return profile(p, applied);
	}

	/** Employers who posted a job can browse public profiles (featured first, when J6 is on). */
	@GetMapping("/talent")
	@Transactional(readOnly = true)
	public PageDto<ProfileView> talentSearch(@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page) {
		UUID me = customer();
		if (jobs.countByEmployerId(me) == 0) {
			throw new ApiException(HttpStatus.FORBIDDEN, "EMPLOYERS_ONLY", "Post a job first to browse profiles.");
		}
		return PageDto.of(profiles.searchPublic(blankToNull(q), PageRequest.of(page, 20)).map(p -> profile(p, false)));
	}

	// ---------- applying ----------

	@PostMapping("/jobs/{id}/apply")
	public ApplicationView apply(@PathVariable Long id, @Valid @RequestBody ApplyRequest r) {
		UUID me = customer();
		JobApplication a = board.apply(me, id, r.cvKind(), r.cvFileId(), r.message());
		return myApplication(a.getId(), me);
	}

	@GetMapping("/applications")
	@Transactional(readOnly = true)
	public List<ApplicationView> myApplications() {
		UUID me = customer();
		return applications.findByUserIdOrderByCreatedAtDesc(me).stream()
				.map(a -> new ApplicationView(a.getId(), a.getStatus().name(), a.getCvKind().name(), a.getCvFileId(), a.getMessage(),
						a.getCreatedAt(), jobs.findById(a.getJobId()).map(j -> view(j, me, false)).orElse(null), null))
				.toList();
	}

	// ---------- employers ----------

	@PostMapping("/my-jobs")
	public JobView postJob(@Valid @RequestBody JobRequest r) {
		UUID me = customer();
		JobPost j = board.post(me, new JobBoardService.JobForm(r.employerName(), r.title(), r.place(), r.type(), r.field(),
				r.salaryMin(), r.salaryMax(), r.salaryNote(), r.description(), r.requirements(), r.deadline()));
		return view(j, me, true);
	}

	@GetMapping("/my-jobs")
	@Transactional(readOnly = true)
	public List<JobView> myJobs() {
		UUID me = customer();
		return jobs.findByEmployerIdOrderByCreatedAtDesc(me).stream().map(j -> view(j, me, true)).toList();
	}

	@PostMapping("/my-jobs/{id}/close")
	public JobView closeJob(@PathVariable Long id) {
		UUID me = customer();
		return view(board.close(me, id), me, true);
	}

	@GetMapping("/my-jobs/{id}/applications")
	@Transactional(readOnly = true)
	public List<ApplicationView> jobApplications(@PathVariable Long id) {
		UUID me = customer();
		JobPost j = board.own(me, id);
		JobView jv = view(j, me, true);
		return applications.findByJobIdOrderByCreatedAtDesc(id).stream()
				.map(a -> new ApplicationView(a.getId(), a.getStatus().name(), a.getCvKind().name(), a.getCvFileId(), a.getMessage(),
						a.getCreatedAt(), jv, profiles.findById(a.getProfileId()).map(p -> profile(p, true)).orElse(null)))
				.toList();
	}

	@PostMapping("/applications/{id}/status")
	public Map<String, Object> setStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest r) {
		JobApplication a = board.setStatus(customer(), id, r.status());
		return Map.of("id", a.getId(), "status", a.getStatus().name());
	}

	/** The CV file an applicant sent, for the employer of that job. */
	@GetMapping("/applications/{id}/cv")
	public ResponseEntity<byte[]> applicationCv(@PathVariable Long id) {
		UUID me = customer();
		JobApplication a = applications.findById(id).orElseThrow(() -> ApiException.notFound("Application"));
		board.own(me, a.getJobId());
		if (a.getCvFileId() == null) {
			throw ApiException.notFound("File");
		}
		TalentFile f = files.findById(a.getCvFileId()).orElseThrow(() -> ApiException.notFound("File"));
		return store.download(f.getStorageKey(), f.getFileName(), f.getContentType());
	}

	// ---------- professional CV (J5) ----------

	@GetMapping("/cv-orders/quote")
	public CvOrderService.Quote quote(@RequestParam CvOrder.Package pack, @RequestParam(defaultValue = "false") boolean express) {
		features.require(Features.CV_SERVICE);
		return cv.quote(CurrentUser.customerId().orElse(null), pack, express);
	}

	@PostMapping("/cv-orders")
	public CvOrderView orderCv(@Valid @RequestBody CvOrderRequest r) {
		UUID me = customer();
		return order(cv.create(me, r.pack(), Boolean.TRUE.equals(r.express()), r.language(), r.targetJob(), r.details()));
	}

	@GetMapping("/cv-orders")
	@Transactional(readOnly = true)
	public List<CvOrderView> myCvOrders() {
		return cvOrders.findByUserIdOrderByCreatedAtDesc(customer()).stream().map(this::order).toList();
	}

	@PostMapping("/cv-orders/{id}/payment-reference")
	public CvOrderView paymentReference(@PathVariable Long id, @Valid @RequestBody ReferenceRequest r) {
		return order(cv.paymentReference(customer(), id, r.reference()));
	}

	@PostMapping(path = "/cv-orders/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public CvOrderView cvOrderFile(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
		UUID me = customer();
		cv.addCustomerFile(me, id, file);
		return order(cv.own(me, id));
	}

	@GetMapping("/cv-orders/{id}/files/{fileId}")
	public ResponseEntity<byte[]> cvOrderFileDownload(@PathVariable Long id, @PathVariable Long fileId) {
		CvOrder o = cv.own(customer(), id);
		CvOrderFile f = cvOrderFiles.findById(fileId).filter(x -> x.getOrderId().equals(o.getId())).orElseThrow(() -> ApiException.notFound("File"));
		return store.download(f.getStorageKey(), f.getFileName(), f.getContentType());
	}

	@PostMapping("/cv-orders/{id}/respond")
	public CvOrderView respond(@PathVariable Long id, @Valid @RequestBody RespondRequest r) {
		return order(cv.respond(customer(), id, Boolean.TRUE.equals(r.approve()), r.changes()));
	}

	// ---------- helpers ----------

	/** A signed-in customer (staff use the admin pages). */
	static UUID customer() {
		CurrentUser u = CurrentUser.require();
		if (u.role() != Role.CUSTOMER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "CUSTOMERS_ONLY", "Use a customer account for jobs and CVs.");
		}
		return u.id();
	}

	private ProfileView myProfileTx(UUID me) {
		return profile(talent.requireMine(me), true);
	}

	private ApplicationView myApplication(Long id, UUID me) {
		JobApplication a = applications.findById(id).orElseThrow();
		return new ApplicationView(a.getId(), a.getStatus().name(), a.getCvKind().name(), a.getCvFileId(), a.getMessage(),
				a.getCreatedAt(), jobs.findById(a.getJobId()).map(j -> view(j, me, false)).orElse(null), null);
	}

	JobView view(JobPost j, UUID me, boolean owner) {
		return new JobView(j.getId(), j.getTitle(), j.getEmployerName(), j.getPlace(), j.getType().name(), j.getField(),
				j.getSalaryMin(), j.getSalaryMax(), j.getSalaryNote(), j.getDescription(), j.getRequirements(), j.getDeadline(),
				j.isFeatured(), j.getCreatedAt(), owner ? j.getStatus().name() : null, owner ? j.getStatusNote() : null,
				owner ? j.getFee() : null, owner && j.isFeePaid(), me != null && applications.existsByJobIdAndUserId(j.getId(), me),
				owner ? applications.countByJobId(j.getId()) : 0);
	}

	ProfileView profile(TalentProfile p, boolean withPhoneAndFiles) {
		List<ExperienceView> exp = experience.findByProfileIdOrderByPositionAsc(p.getId()).stream()
				.map(e -> new ExperienceView(e.getTitle(), e.getPlace(), e.getStartMonth(), e.getEndMonth(), e.getDescription())).toList();
		List<FileView> fl = withPhoneAndFiles
				? files.findByProfileIdOrderByIdDesc(p.getId()).stream().filter(f -> f.getKind() != TalentFile.Kind.STUDENT_ID || isOwner(p))
						.map(FileView::of).toList()
				: List.of();
		return new ProfileView(p.getId(), p.getFullName(), p.getStatus().name(), p.getHeadline(), p.getAbout(), p.getSchool(),
				p.getFieldOfStudy(), p.getGraduationYear(), TalentService.split(p.getSkills()), TalentService.split(p.getLanguages()),
				TalentService.split(p.getWorkTypes()), TalentService.split(p.getWorkPlaces()), p.isPublicProfile(),
				isOwner(p) ? p.getStudentStatus().name() : null, isOwner(p) ? p.getStudentNote() : null, p.getStudentVerifiedAt() != null,
				exp, fl, withPhoneAndFiles ? talent.phoneOf(p) : null, p.getUpdatedAt());
	}

	CvOrderView order(CvOrder o) {
		String payTo = o.getStatus() == CvOrder.Status.AWAITING_PAYMENT ? features.text(Features.SUPPORT_PHONE) : null;
		return new CvOrderView(o.getId(), o.getPack().name(), o.isExpress(), o.getLanguage(), o.getPrice(), o.getDiscountPercent(),
				o.getTotal(), o.getStatus().name(), o.getTargetJob(), o.getDetails(), o.getPaymentReference(), o.getWriter(),
				o.getChangesAllowed(), o.getChangesUsed(), o.getChangeRequest(), o.getDueAt(), o.getPaidAt(), o.getDoneAt(),
				o.getCreatedAt(), cvOrderFiles.findByOrderIdOrderByIdAsc(o.getId()).stream()
						.filter(f -> f.getKind() != CvOrderFile.Kind.DRAFT || o.getStatus() != CvOrder.Status.AWAITING_PAYMENT)
						.map(CvOrderFileView::of).toList(),
				payTo == null || payTo.isBlank() ? null : payTo);
	}

	private static boolean isOwner(TalentProfile p) {
		return CurrentUser.get().map(u -> u.id().equals(p.getUserId())).orElse(false);
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}
}
