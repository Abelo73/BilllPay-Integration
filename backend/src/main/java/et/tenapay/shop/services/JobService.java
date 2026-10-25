package et.tenapay.shop.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.ImageProcessor;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.media.MediaStorage;
import et.tenapay.shop.services.ProService.ProCard;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.extern.slf4j.Slf4j;

/**
 * Job requests and quotes (design S9/S10). A customer describes a job; pros of that trade (or one pro, when asked from
 * their profile) send a price; the customer accepts one, and only then do both see each other's phone number. When the
 * work is done the customer marks it done and rates the pro. Deposits through BillPay come with M15.
 */
@Slf4j
@Service
public class JobService {

	public static final Duration JOB_TTL = Duration.ofDays(7);
	public static final int MAX_JOBS_PER_DAY = 5;
	public static final int MAX_PHOTOS = 3;

	private final JobRequestRepository jobs;
	private final JobQuoteRepository quotes;
	private final JobPhotoRepository photos;
	private final ProProfileRepository pros;
	private final ProService proService;
	private final UserRepository users;
	private final ImageProcessor images;
	private final MediaStorage storage;
	private final MediaProperties media;
	private final SmsService sms;
	private final AppProperties app;
	private final TransactionTemplate tx;
	private final et.tenapay.shop.inbox.InboxService inbox;
	private et.tenapay.shop.sms.SmsLanguage smsLanguage;

	/** SMS in Amharic for people who use the site in Amharic. */
	@org.springframework.beans.factory.annotation.Autowired(required = false)
	void setSmsLanguage(et.tenapay.shop.sms.SmsLanguage smsLanguage) {
		this.smsLanguage = smsLanguage;
	}

	public JobService(JobRequestRepository jobs, JobQuoteRepository quotes, JobPhotoRepository photos, ProProfileRepository pros,
			ProService proService, UserRepository users, ImageProcessor images, MediaStorage storage, MediaProperties media,
			SmsService sms, AppProperties app, TransactionTemplate tx, et.tenapay.shop.inbox.InboxService inbox) {
		this.jobs = jobs;
		this.quotes = quotes;
		this.photos = photos;
		this.pros = pros;
		this.proService = proService;
		this.users = users;
		this.images = images;
		this.storage = storage;
		this.media = media;
		this.sms = sms;
		this.app = app;
		this.tx = tx;
		this.inbox = inbox;
	}

	// ---------- views ----------

	public record QuoteView(Long id, ProCard pro, BigDecimal price, String message, String available, String status,
			Instant createdAt, String proPhone) {
	}

	/**
	 * {@code customerName}/{@code customerPhone}: the phone only for the pro whose quote was accepted. {@code quotes}: all
	 * of them for the customer, only their own for a pro. {@code myQuote}: the viewing pro's quote.
	 */
	public record JobView(Long id, String trade, String description, String area, String timing, LocalDate preferredDate,
			BigDecimal budget, String status, Instant createdAt, Instant expiresAt, List<String> photoUrls, int quoteCount,
			List<QuoteView> quotes, QuoteView myQuote, String customerName, String customerPhone, Short rating, String review,
			boolean direct,
			/** true when the viewer is the customer who posted the job */
			boolean mine) {
	}

	public record JobInput(ProProfile.Trade trade, String description, String area, JobRequest.Timing timing,
			LocalDate preferredDate, BigDecimal budget, Long proId) {
	}

	public record ProInbox(List<JobView> open, PageDto<JobView> quoted) {
	}

	// ---------- customer ----------

	public JobView create(UUID customerId, JobInput in) {
		String description = ProService.trim(in.description(), 2000);
		String area = ProService.trim(in.area(), 200);
		if (in.trade() == null || description == null || description.length() < 10 || area == null || in.timing() == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_FIELDS",
					"Choose the type of work, describe the job (at least 10 characters), where and when.");
		}
		if (in.timing() == JobRequest.Timing.DATE && (in.preferredDate() == null || in.preferredDate().isBefore(LocalDate.now()))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_DATE", "Pick a date from today on.");
		}
		if (in.budget() != null && in.budget().signum() <= 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_BUDGET", "The budget must be more than 0, or left empty.");
		}
		if (jobs.countByCustomerIdAndCreatedAtAfter(customerId, Instant.now().minus(Duration.ofDays(1))) >= MAX_JOBS_PER_DAY) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_JOBS", "You can post up to 5 jobs a day.");
		}
		ProProfile direct = null;
		if (in.proId() != null) {
			direct = proService.approved(in.proId());
			if (direct.getOwnerId().equals(customerId)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "OWN_PROFILE", "You can't send a job to yourself.");
			}
		}
		ProProfile directPro = direct;
		JobRequest j = tx.execute(s -> {
			JobRequest n = new JobRequest();
			n.setCustomerId(customerId);
			n.setTrade(directPro != null ? directPro.getTrade() : in.trade());
			n.setDescription(description);
			n.setArea(area);
			n.setTiming(in.timing());
			n.setPreferredDate(in.timing() == JobRequest.Timing.DATE ? in.preferredDate() : null);
			n.setBudget(in.budget() == null ? null : in.budget().setScale(2, RoundingMode.HALF_UP));
			n.setDirectProId(directPro == null ? null : directPro.getId());
			n.setExpiresAt(Instant.now().plus(JOB_TTL));
			return jobs.save(n);
		});
		if (directPro != null) {
			tell(directPro.getOwnerId(), directPro.getPhone(),
					"Sodo Gebeya: new job request for you: " + snippet(description) + " Reply with a price: " + link("/pro/jobs/" + j.getId()),
					"ሶዶ ገበያ፦ አዲስ የሥራ ጥያቄ ቀርቦልዎታል። ዋጋ ይላኩ፦ " + link("/pro/jobs/" + j.getId()),
					"JOB:DIRECT:" + j.getId(), "New job request for you", description, "/pro/jobs/" + j.getId());
		}
		return tx.execute(s -> view(jobs.findById(j.getId()).orElseThrow(), customerId, null));
	}

	public String addPhoto(UUID customerId, Long jobId, byte[] upload) {
		JobRequest j = jobs.findById(jobId).filter(x -> x.getCustomerId().equals(customerId)).orElseThrow(() -> ApiException.notFound("Job"));
		if (!j.isOpen(Instant.now()) || photos.countByJobId(jobId) >= MAX_PHOTOS) {
			throw new ApiException(HttpStatus.CONFLICT, "NO_MORE_PHOTOS", "Up to 3 photos, while the job is open.");
		}
		ImageProcessor.Processed img = images.process(upload);
		String key = "jobs/" + jobId + "/" + UUID.randomUUID() + "-l.jpg";
		storage.put(key, img.large(), "image/jpeg");
		tx.executeWithoutResult(s -> {
			JobPhoto p = new JobPhoto();
			p.setJobId(jobId);
			p.setImageKey(key);
			photos.save(p);
		});
		return media.urlFor(key);
	}

	public PageDto<JobView> mine(UUID customerId, int page) {
		return tx.execute(s -> PageDto.of(jobs.findByCustomerIdOrderByCreatedAtDesc(customerId, PageRequest.of(page, 20))
				.map(j -> view(j, customerId, null))));
	}

	/** The customer sees all quotes; a pro who can quote (or did) sees the job and their own quote. */
	public JobView get(UUID userId, Long jobId) {
		return tx.execute(s -> {
			JobRequest j = jobs.findById(jobId).orElseThrow(() -> ApiException.notFound("Job"));
			if (j.getCustomerId().equals(userId)) {
				return view(j, userId, null);
			}
			ProProfile pro = pros.findByOwnerId(userId).filter(p -> p.getStatus().listed()).orElse(null);
			boolean quoted = pro != null && quotes.existsByJobIdAndProId(jobId, pro.getId());
			boolean canSee = pro != null && (quoted || (j.getDirectProId() == null ? j.getTrade() == pro.getTrade()
					: j.getDirectProId().equals(pro.getId())));
			if (!canSee) {
				throw ApiException.notFound("Job");
			}
			return view(j, null, pro);
		});
	}

	public JobView accept(UUID customerId, Long jobId, Long quoteId) {
		record Accepted(JobView view, String proPhone, String customer, UUID proOwner) {
		}
		Accepted a = tx.execute(s -> {
			JobRequest j = ownLocked(customerId, jobId);
			if (!j.isOpen(Instant.now())) {
				throw new ApiException(HttpStatus.CONFLICT, "JOB_CLOSED", "This job is no longer open.");
			}
			JobQuote q = quotes.findById(quoteId).filter(x -> x.getJobId().equals(jobId) && x.getStatus() == JobQuote.Status.SENT)
					.orElseThrow(() -> ApiException.notFound("Quote"));
			for (JobQuote other : quotes.findByJobIdOrderByCreatedAtAsc(jobId)) {
				if (other.getStatus() == JobQuote.Status.SENT) {
					other.setStatus(other.getId().equals(quoteId) ? JobQuote.Status.ACCEPTED : JobQuote.Status.DECLINED);
				}
			}
			j.setStatus(JobRequest.Status.ASSIGNED);
			j.setAcceptedQuoteId(quoteId);
			ProProfile pro = pros.findById(q.getProId()).orElseThrow();
			String customer = users.findById(customerId).map(u -> publicName(u.getFullName()) + (u.getPhone() == null ? "" : " " + u.getPhone()))
					.orElse("the customer");
			return new Accepted(view(j, customerId, null), pro.getPhone(), customer, pro.getOwnerId());
		});
		tell(a.proOwner(), a.proPhone(), "Sodo Gebeya: your quote was accepted. Contact " + a.customer() + ". Details: " + link("/pro/jobs/" + jobId),
				"ሶዶ ገበያ፦ ዋጋዎ ተቀባይነት አግኝቷል። " + a.customer() + "ን ያነጋግሩ፦ " + link("/pro/jobs/" + jobId),
				"JOB:ACCEPTED:" + jobId, "Your price was accepted", "Contact " + a.customer() + " to plan the work.", "/pro/jobs/" + jobId);
		return a.view();
	}

	public JobView cancel(UUID customerId, Long jobId) {
		record Cancelled(JobView view, String proPhone, UUID proOwner) {
		}
		Cancelled c = tx.execute(s -> {
			JobRequest j = ownLocked(customerId, jobId);
			if (j.getStatus() != JobRequest.Status.OPEN && j.getStatus() != JobRequest.Status.ASSIGNED) {
				throw new ApiException(HttpStatus.CONFLICT, "JOB_CLOSED", "This job is already closed.");
			}
			ProProfile assigned = j.getStatus() == JobRequest.Status.ASSIGNED && j.getAcceptedQuoteId() != null
					? quotes.findById(j.getAcceptedQuoteId()).flatMap(q -> pros.findById(q.getProId())).orElse(null) : null;
			j.setStatus(JobRequest.Status.CANCELLED);
			quotes.findByJobIdOrderByCreatedAtAsc(jobId).stream().filter(q -> q.getStatus() == JobQuote.Status.SENT)
					.forEach(q -> q.setStatus(JobQuote.Status.DECLINED));
			return new Cancelled(view(j, customerId, null), assigned == null ? null : assigned.getPhone(),
					assigned == null ? null : assigned.getOwnerId());
		});
		if (c.proOwner() != null) {
			tell(c.proOwner(), c.proPhone(), "Sodo Gebeya: the customer cancelled job #" + jobId + ". No need to go.",
					"ሶዶ ገበያ፦ ደንበኛው ሥራ #" + jobId + "ን ሰርዘዋል። መሄድ አያስፈልግም።", "JOB:CANCELLED:" + jobId,
					"Job cancelled", "The customer cancelled job #" + jobId + ". No need to go.", "/pro/jobs/" + jobId);
		}
		return c.view();
	}

	/** The customer confirms the work is done and rates the pro (1–5). */
	public JobView done(UUID customerId, Long jobId, int rating, String review) {
		if (rating < 1 || rating > 5) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_RATING", "Give 1 to 5 stars.");
		}
		return tx.execute(s -> {
			JobRequest j = ownLocked(customerId, jobId);
			if (j.getStatus() != JobRequest.Status.ASSIGNED) {
				throw new ApiException(HttpStatus.CONFLICT, "NOT_ASSIGNED", "Accept a quote first; you can mark the job done after the work.");
			}
			j.setStatus(JobRequest.Status.DONE);
			j.setCompletedAt(Instant.now());
			j.setRating((short) rating);
			j.setReview(ProService.trim(review, 1000));
			JobQuote q = quotes.findById(j.getAcceptedQuoteId()).orElseThrow();
			ProProfile pro = pros.findById(q.getProId()).orElseThrow();
			pro.setJobsDone(pro.getJobsDone() + 1);
			pro.setRatingSum(pro.getRatingSum() + rating);
			pro.setRatingCount(pro.getRatingCount() + 1);
			return view(j, customerId, null);
		});
	}

	// ---------- pro ----------

	public JobView quote(UUID proOwnerId, Long jobId, BigDecimal price, String message, String available) {
		if (price == null || price.signum() <= 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_PRICE", "Enter your price in ETB.");
		}
		record Quoted(JobView view, String customerPhone, String proName, BigDecimal price, UUID customerId) {
		}
		Quoted q;
		try {
			q = tx.execute(s -> {
				ProProfile pro = pros.findByOwnerId(proOwnerId).filter(p -> p.getStatus().listed())
						.orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PRO", "Only approved pros can send quotes."));
				JobRequest j = jobs.lockById(jobId).orElseThrow(() -> ApiException.notFound("Job"));
				boolean visible = j.getDirectProId() == null ? j.getTrade() == pro.getTrade() : j.getDirectProId().equals(pro.getId());
				if (!visible || j.getCustomerId().equals(proOwnerId)) {
					throw ApiException.notFound("Job");
				}
				if (!j.isOpen(Instant.now())) {
					throw new ApiException(HttpStatus.CONFLICT, "JOB_CLOSED", "This job is no longer open.");
				}
				if (quotes.existsByJobIdAndProId(jobId, pro.getId())) {
					throw new ApiException(HttpStatus.CONFLICT, "ALREADY_QUOTED", "You already sent a price for this job.");
				}
				JobQuote n = new JobQuote();
				n.setJobId(jobId);
				n.setProId(pro.getId());
				n.setPrice(price.setScale(2, RoundingMode.HALF_UP));
				n.setMessage(ProService.trim(message, 1000));
				n.setAvailable(ProService.trim(available, 120));
				quotes.saveAndFlush(n);
				String phone = users.findById(j.getCustomerId()).map(User::getPhone).orElse(null);
				return new Quoted(view(j, null, pro), phone, pro.getDisplayName(), n.getPrice(), j.getCustomerId());
			});
		} catch (DataIntegrityViolationException twice) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_QUOTED", "You already sent a price for this job.");
		}
		// at most one "new quote" text per job per hour
		String priceText = q.price().stripTrailingZeros().toPlainString() + " ETB";
		tell(q.customerId(), q.customerPhone(), "Sodo Gebeya: new quote for your job: " + priceText + " from "
				+ ascii(q.proName(), 30) + ". Compare: " + link("/jobs/" + jobId),
				"ሶዶ ገበያ፦ ለሥራዎ አዲስ ዋጋ፦ " + priceText.replace("ETB", "ብር") + " ከ" + q.proName() + "። ያወዳድሩ፦ " + link("/jobs/" + jobId),
				"JOB:QUOTE:" + jobId + ":" + Instant.now().getEpochSecond() / 3600,
				"New price for your job", priceText + " from " + q.proName(), "/jobs/" + jobId);
		return q.view();
	}

	public JobView withdraw(UUID proOwnerId, Long jobId) {
		return tx.execute(s -> {
			ProProfile pro = pros.findByOwnerId(proOwnerId).orElseThrow(() -> ApiException.notFound("Job"));
			JobQuote q = quotes.findByJobIdOrderByCreatedAtAsc(jobId).stream().filter(x -> x.getProId().equals(pro.getId()))
					.findFirst().orElseThrow(() -> ApiException.notFound("Quote"));
			if (q.getStatus() != JobQuote.Status.SENT) {
				throw new ApiException(HttpStatus.CONFLICT, "QUOTE_CLOSED", "This quote can no longer be withdrawn.");
			}
			q.setStatus(JobQuote.Status.WITHDRAWN);
			return view(jobs.findById(jobId).orElseThrow(), null, pro);
		});
	}

	/** Open jobs the pro can quote on, and the jobs they already quoted. */
	public ProInbox proInbox(UUID proOwnerId, int page) {
		return tx.execute(s -> {
			ProProfile pro = pros.findByOwnerId(proOwnerId).filter(p -> p.getStatus().listed())
					.orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PRO", "Your pro profile isn't approved yet."));
			List<JobView> open = jobs.openFor(pro.getId(), proOwnerId, pro.getTrade(), Instant.now(), PageRequest.of(0, 50))
					.map(j -> view(j, null, pro)).getContent();
			PageDto<JobView> quoted = PageDto.of(quotes.findByProIdOrderByCreatedAtDesc(pro.getId(), PageRequest.of(page, 20))
					.map(q -> view(jobs.findById(q.getJobId()).orElseThrow(), null, pro)));
			return new ProInbox(open, quoted);
		});
	}

	// ---------- helpers ----------

	private JobRequest ownLocked(UUID customerId, Long jobId) {
		return jobs.lockById(jobId).filter(j -> j.getCustomerId().equals(customerId)).orElseThrow(() -> ApiException.notFound("Job"));
	}

	private JobView view(JobRequest j, UUID customer, ProProfile viewingPro) {
		Instant now = Instant.now();
		String status = j.getStatus() == JobRequest.Status.OPEN && !j.getExpiresAt().isAfter(now) ? "EXPIRED" : j.getStatus().name();
		List<JobQuote> all = quotes.findByJobIdOrderByCreatedAtAsc(j.getId());
		List<String> pics = photos.findByJobIdOrderByIdAsc(j.getId()).stream().map(p -> media.urlFor(p.getImageKey())).toList();
		List<QuoteView> visible;
		QuoteView mine = null;
		String customerPhone = null;
		if (customer != null) {
			visible = all.stream().map(q -> quoteView(q, q.getId().equals(j.getAcceptedQuoteId()))).toList();
		} else {
			visible = List.of();
			JobQuote own = all.stream().filter(q -> q.getProId().equals(viewingPro.getId())).findFirst().orElse(null);
			if (own != null) {
				mine = quoteView(own, false);
				if (own.getId().equals(j.getAcceptedQuoteId())) {
					customerPhone = users.findById(j.getCustomerId()).map(User::getPhone).orElse(null);
				}
			}
		}
		String customerName = users.findById(j.getCustomerId()).map(u -> publicName(u.getFullName())).orElse("Customer");
		return new JobView(j.getId(), j.getTrade().name(), j.getDescription(), j.getArea(), j.getTiming().name(), j.getPreferredDate(),
				j.getBudget(), status, j.getCreatedAt(), j.getExpiresAt(), pics, all.size(), visible, mine, customerName, customerPhone,
				j.getRating(), j.getReview(), j.getDirectProId() != null, customer != null);
	}

	private QuoteView quoteView(JobQuote q, boolean showPhone) {
		ProProfile pro = pros.findById(q.getProId()).orElseThrow();
		return new QuoteView(q.getId(), proService.card(pro), q.getPrice(), q.getMessage(), q.getAvailable(), q.getStatus().name(),
				q.getCreatedAt(), showPhone ? pro.getPhone() : null);
	}

	/**
	 * Tells a person about a job event: always in the app (once per {@code key}), and by SMS unless they turned job SMS
	 * off. In-app keys get their own prefix; the SMS key throttles texts (e.g. one "new quote" per hour).
	 */
	private void tell(UUID userId, String phone, String smsBody, String key, String title, String body, String link) {
		tell(userId, phone, smsBody, null, key, title, body, link);
	}

	/** {@code smsAmharic} goes to people who use the site in Amharic (null = always English). */
	private void tell(UUID userId, String phone, String smsBody, String smsAmharic, String key, String title, String body,
			String link) {
		inbox.notify(userId, et.tenapay.shop.inbox.InboxItem.Kind.JOB, title, body, link,
				"INBOX:" + key + (key.startsWith("JOB:QUOTE:") ? ":" + UUID.randomUUID() : ""));
		if (inbox.wantsSms(userId, et.tenapay.shop.inbox.InboxService.SmsTopic.JOBS)) {
			boolean amharic = smsAmharic != null && smsLanguage != null && smsLanguage.amharic(userId);
			text(phone, amharic ? smsAmharic : smsBody, key, amharic);
		}
	}

	/** {@code unicode}: keep non-Latin letters (Amharic); English texts are cut to plain ASCII so they stay one part. */
	private void text(String phone, String body, String key, boolean unicode) {
		if (phone == null || !phone.matches("^\\+251[79]\\d{8}$")) {
			return;
		}
		String plain = unicode ? body : body.replaceAll("[^\\x20-\\x7E]", "");
		java.util.concurrent.CompletableFuture.runAsync(() -> sms.sendOnce(SmsService.Kind.JOB, phone, plain, null, key));
	}

	private String link(String path) {
		return app.publicBaseUrl().replaceAll("/+$", "") + path;
	}

	private static String snippet(String s) {
		String plain = ascii(s, 60);
		return plain.length() == 60 ? plain + "..." : plain;
	}

	private static String ascii(String s, int max) {
		String plain = s == null ? "" : s.replaceAll("[^\\x20-\\x7E]", "").strip();
		return plain.length() > max ? plain.substring(0, max) : plain;
	}

	static String publicName(String fullName) {
		if (fullName == null || fullName.isBlank()) {
			return "Customer";
		}
		String[] parts = fullName.strip().split("\\s+");
		return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1].charAt(0) + "." : parts[0];
	}
}
