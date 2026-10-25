package et.tenapay.shop.work;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** J3 job posts (checked by staff before they go live) and J4 one-tap applications. */
@Slf4j
@Service
@RequiredArgsConstructor
public class JobBoardService {

	static final ZoneId ADDIS = ZoneId.of("Africa/Addis_Ababa");

	private final JobPostRepository jobs;
	private final JobApplicationRepository applications;
	private final TalentProfileRepository profiles;
	private final TalentFileRepository files;
	private final TalentService talent;
	private final Features features;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	public record JobForm(String employerName, String title, String place, JobPost.Type type, String field,
			BigDecimal salaryMin, BigDecimal salaryMax, String salaryNote, String description, String requirements,
			LocalDate deadline) {
	}

	/** Words that suggest the applicant is asked to pay; such posts are refused (rule: no fees for applicants). */
	private static final java.util.regex.Pattern ASKS_FOR_MONEY = java.util.regex.Pattern.compile(
			"(?i)(application|registration|processing|training)\\s+fee|pay\\s+(a\\s+)?(fee|deposit)|deposit\\s+(of|birr)");

	public JobPost post(UUID employerId, JobForm f) {
		features.require(Features.JOB_POSTS);
		if (TalentService.blank(f.title()) || TalentService.blank(f.employerName()) || TalentService.blank(f.place())
				|| TalentService.blank(f.description()) || f.type() == null || f.deadline() == null) {
			throw TalentService.bad("FIELDS_REQUIRED", "Fill in the title, employer, place, type, description and deadline.");
		}
		LocalDate today = LocalDate.now(ADDIS);
		if (f.deadline().isBefore(today) || f.deadline().isAfter(today.plusDays(90))) {
			throw TalentService.bad("DEADLINE_INVALID", "The deadline must be within the next 90 days.");
		}
		if (f.salaryMin() != null && f.salaryMax() != null && f.salaryMin().compareTo(f.salaryMax()) > 0) {
			throw TalentService.bad("SALARY_INVALID", "The lowest salary can't be more than the highest.");
		}
		String text = f.title() + " " + f.description() + " " + (f.requirements() == null ? "" : f.requirements());
		if (ASKS_FOR_MONEY.matcher(text).find()) {
			throw TalentService.bad("NO_FEES_FOR_APPLICANTS", "Job posts may not ask applicants to pay anything.");
		}
		boolean free = features.on(Features.FREE_FIRST_POST) && jobs.countByEmployerId(employerId) == 0;
		return tx.execute(s -> {
			JobPost j = new JobPost();
			j.setEmployerId(employerId);
			j.setEmployerName(f.employerName().trim());
			j.setTitle(f.title().trim());
			j.setPlace(f.place().trim());
			j.setType(f.type());
			j.setField(TalentService.blank(f.field()) ? null : f.field().trim());
			j.setSalaryMin(f.salaryMin());
			j.setSalaryMax(f.salaryMax());
			j.setSalaryNote(TalentService.blank(f.salaryNote()) ? null : f.salaryNote().trim());
			j.setDescription(f.description().trim());
			j.setRequirements(TalentService.blank(f.requirements()) ? null : f.requirements().trim());
			j.setDeadline(f.deadline());
			j.setFee(free ? BigDecimal.ZERO : features.number(Features.JOB_POST_PRICE));
			j.setFeePaid(free || j.getFee().signum() == 0);
			jobs.save(j);
			metrics.shopEvent("job_posted");
			log.info("Job post #{} \"{}\" by {} waits for review (fee {})", j.getId(), j.getTitle(), employerId, j.getFee());
			return j;
		});
	}

	public JobPost close(UUID employerId, Long jobId) {
		return tx.execute(s -> {
			JobPost j = own(employerId, jobId);
			j.setStatus(JobPost.Status.CLOSED);
			return j;
		});
	}

	/** Staff: go live (the fee must be paid, or marked paid now), reject with a reason, feature, or take down. */
	public JobPost decide(Long jobId, JobPost.Status to, String note, Boolean markPaid, Boolean featured, String by) {
		return tx.execute(s -> {
			JobPost j = jobs.findById(jobId).orElseThrow(() -> ApiException.notFound("Job"));
			if (Boolean.TRUE.equals(markPaid)) {
				j.setFeePaid(true);
			}
			if (featured != null) {
				j.setFeatured(featured);
			}
			if (to != null && to != j.getStatus()) {
				if (to == JobPost.Status.LIVE && !j.isFeePaid()) {
					throw new ApiException(HttpStatus.CONFLICT, "FEE_NOT_PAID", "The " + j.getFee() + " birr fee isn't paid yet. Mark it paid once it arrives.");
				}
				if ((to == JobPost.Status.REJECTED || to == JobPost.Status.CLOSED) && TalentService.blank(note)) {
					throw TalentService.bad("REASON_REQUIRED", "Tell the employer why.");
				}
				j.setStatus(to);
				j.setStatusNote(to == JobPost.Status.LIVE ? null : note.trim());
				j.setDecidedBy(by);
				j.setDecidedAt(Instant.now());
				log.info("Job post #{} -> {} by {}", jobId, to, by);
			}
			return j;
		});
	}

	public JobApplication apply(UUID userId, Long jobId, JobApplication.CvKind cvKind, Long cvFileId, String message) {
		features.require(Features.ONE_TAP_APPLY);
		TalentProfile p = talent.requireMine(userId);
		JobPost j = jobs.findById(jobId).filter(JobPost::open).orElseThrow(() -> ApiException.notFound("Job"));
		if (j.getEmployerId().equals(userId)) {
			throw TalentService.bad("OWN_JOB", "You can't apply to your own job.");
		}
		if (applications.existsByJobIdAndUserId(jobId, userId)) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_APPLIED", "You already applied to this job.");
		}
		long today = applications.countSince(userId, Instant.now().minusSeconds(86400));
		if (today >= features.integer(Features.MAX_APPLICATIONS_PER_DAY)) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_APPLICATIONS",
					"You've applied to " + today + " jobs today. Try again tomorrow.");
		}
		JobApplication.CvKind kind = cvKind == null ? JobApplication.CvKind.AUTO : cvKind;
		if (kind == JobApplication.CvKind.AUTO) {
			features.require(Features.AUTO_CV);
		} else {
			TalentFile f = cvFileId == null ? null : files.findById(cvFileId).orElse(null);
			if (f == null || !f.getProfileId().equals(p.getId())
					|| (f.getKind() != TalentFile.Kind.CV_UPLOAD && f.getKind() != TalentFile.Kind.CV_PRO)) {
				throw TalentService.bad("CV_INVALID", "Choose one of your CVs.");
			}
		}
		try {
			return tx.execute(s -> {
				JobApplication a = new JobApplication();
				a.setJobId(jobId);
				a.setProfileId(p.getId());
				a.setUserId(userId);
				a.setCvKind(kind);
				a.setCvFileId(kind == JobApplication.CvKind.FILE ? cvFileId : null);
				a.setMessage(TalentService.blank(message) ? null : message.trim().substring(0, Math.min(message.trim().length(), 1000)));
				applications.saveAndFlush(a);
				metrics.shopEvent("job_application");
				return a;
			});
		} catch (DataIntegrityViolationException twice) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_APPLIED", "You already applied to this job.");
		}
	}

	/** The employer moves an application along; the applicant gets an SMS for "Interview" and "Hired". */
	public JobApplication setStatus(UUID employerId, Long applicationId, JobApplication.Status to) {
		JobApplication a = tx.execute(s -> {
			JobApplication app = applications.findById(applicationId).orElseThrow(() -> ApiException.notFound("Application"));
			own(employerId, app.getJobId());
			app.setStatus(to);
			return app;
		});
		if (to == JobApplication.Status.INTERVIEW || to == JobApplication.Status.HIRED) {
			JobPost j = jobs.findById(a.getJobId()).orElseThrow();
			String phone = profiles.findById(a.getProfileId()).map(talent::phoneOf).orElse(null);
			if (phone != null) {
				String text = to == JobApplication.Status.INTERVIEW
						? "Sodo Gebeya: " + j.getEmployerName() + " wants to interview you for \"" + j.getTitle() + "\". Open Jobs > My applications."
						: "Sodo Gebeya: congratulations! " + j.getEmployerName() + " chose you for \"" + j.getTitle() + "\".";
				AfterCommit.run(() -> sms.send(SmsService.Kind.JOB, phone, text, null, null));
			}
		}
		return a;
	}

	public JobPost own(UUID employerId, Long jobId) {
		return jobs.findById(jobId).filter(j -> j.getEmployerId().equals(employerId)).orElseThrow(() -> ApiException.notFound("Job"));
	}
}
