package et.tenapay.shop.work;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.AfterCommit;
import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.monitoring.ShopMetrics;
import et.tenapay.shop.sms.SmsService;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * J5: professional CVs written by our team. Paid → writing → draft sent → (changes) → done; the final CV is saved in the
 * person's profile, ready for one-tap apply. While online payment is off, people pay by telebirr or bank transfer and
 * staff confirm the payment.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CvOrderService {

	static final Set<CvOrder.Status> OPEN = EnumSet.of(CvOrder.Status.AWAITING_PAYMENT, CvOrder.Status.PAID,
			CvOrder.Status.WRITING, CvOrder.Status.DRAFT_SENT, CvOrder.Status.CHANGES);
	static final Set<CvOrder.Status> IN_WORK = EnumSet.of(CvOrder.Status.PAID, CvOrder.Status.WRITING, CvOrder.Status.CHANGES);

	private final CvOrderRepository orders;
	private final CvOrderFileRepository orderFiles;
	private final TalentProfileRepository profiles;
	private final TalentFileRepository talentFiles;
	private final UserRepository users;
	private final WorkFiles store;
	private final Features features;
	private final SmsService sms;
	private final ShopMetrics metrics;
	private final TransactionTemplate tx;

	public record Quote(CvOrder.Package pack, boolean express, BigDecimal price, BigDecimal expressFee, int discountPercent,
			BigDecimal total, int days, int changesAllowed) {
	}

	public Quote quote(UUID userId, CvOrder.Package pack, boolean express) {
		BigDecimal price = switch (pack) {
			case BASIC -> features.number(Features.CV_BASIC_PRICE);
			case COVER -> features.number(Features.CV_COVER_PRICE);
			case PREMIUM -> features.number(Features.CV_PREMIUM_PRICE);
		};
		BigDecimal fee = express ? features.number(Features.CV_EXPRESS_FEE) : BigDecimal.ZERO;
		boolean student = userId != null && profiles.findByUserId(userId).map(p -> p.getStudentVerifiedAt() != null).orElse(false);
		int discount = student && features.on(Features.STUDENT_BADGE) ? features.integer(Features.STUDENT_DISCOUNT) : 0;
		BigDecimal gross = price.add(fee);
		BigDecimal total = gross.subtract(gross.multiply(BigDecimal.valueOf(discount)).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP))
				.setScale(2, RoundingMode.HALF_UP);
		int days = express ? 1 : pack == CvOrder.Package.PREMIUM ? 3 : 2;
		return new Quote(pack, express, price, fee, discount, total, days, pack == CvOrder.Package.PREMIUM ? 2 : 1);
	}

	public CvOrder create(UUID userId, CvOrder.Package pack, boolean express, String language, String targetJob, String details) {
		features.require(Features.CV_SERVICE);
		if (orders.countByStatusIn(IN_WORK) >= features.integer(Features.MAX_OPEN_CV_ORDERS)) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "CV_TEAM_FULL",
					"Our CV writers are fully booked right now. Please try again in a day or two.");
		}
		String lang = language == null ? "EN" : language.toUpperCase();
		if (!Set.of("EN", "AM", "BOTH").contains(lang)) {
			throw TalentService.bad("LANGUAGE_INVALID", "Choose English, Amharic or both.");
		}
		if (pack != CvOrder.Package.PREMIUM && lang.equals("BOTH")) {
			throw TalentService.bad("LANGUAGE_INVALID", "Both languages come with Premium.");
		}
		Quote q = quote(userId, pack, express);
		return tx.execute(s -> {
			CvOrder o = new CvOrder();
			o.setUserId(userId);
			o.setPack(pack);
			o.setExpress(express);
			o.setLanguage(lang);
			o.setPrice(q.price().add(q.expressFee()));
			o.setDiscountPercent(q.discountPercent());
			o.setTotal(q.total());
			o.setChangesAllowed(q.changesAllowed());
			o.setTargetJob(TalentService.blank(targetJob) ? null : cut(targetJob, 200));
			o.setDetails(TalentService.blank(details) ? null : cut(details, 4000));
			orders.save(o);
			metrics.shopEvent("cv_order");
			log.info("CV order #{} {} (express {}) for {} ETB", o.getId(), pack, express, o.getTotal());
			return o;
		});
	}

	public CvOrder own(UUID userId, Long id) {
		return orders.findById(id).filter(o -> o.getUserId().equals(userId)).orElseThrow(() -> ApiException.notFound("CV order"));
	}

	/** The customer tells us the transfer reference after paying by telebirr or bank. */
	public CvOrder paymentReference(UUID userId, Long id, String reference) {
		return tx.execute(s -> {
			CvOrder o = own(userId, id);
			if (o.getStatus() != CvOrder.Status.AWAITING_PAYMENT) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PAID", "This order is already paid.");
			}
			o.setPaymentReference(cut(reference, 120));
			return o;
		});
	}

	public CvOrderFile addCustomerFile(UUID userId, Long id, MultipartFile upload) {
		CvOrder o = own(userId, id);
		if (!OPEN.contains(o.getStatus())) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_CLOSED", "This order is finished.");
		}
		return saveFile(o, CvOrderFile.Kind.CUSTOMER, upload);
	}

	/** The customer approves the draft (done) or asks for changes (within the rounds included). */
	public CvOrder respond(UUID userId, Long id, boolean approve, String changes) {
		CvOrder o = tx.execute(s -> {
			CvOrder ord = own(userId, id);
			if (ord.getStatus() != CvOrder.Status.DRAFT_SENT) {
				throw new ApiException(HttpStatus.CONFLICT, "NO_DRAFT", "There's no draft to review yet.");
			}
			if (approve) {
				ord.setStatus(CvOrder.Status.DONE);
				ord.setDoneAt(Instant.now());
			} else {
				if (ord.getChangesUsed() >= ord.getChangesAllowed()) {
					throw new ApiException(HttpStatus.CONFLICT, "NO_CHANGES_LEFT", "All rounds of changes are used. Approve the draft, or ask us for help.");
				}
				if (TalentService.blank(changes)) {
					throw TalentService.bad("CHANGES_REQUIRED", "Tell us what to change.");
				}
				ord.setChangesUsed(ord.getChangesUsed() + 1);
				ord.setChangeRequest(cut(changes, 1500));
				ord.setStatus(CvOrder.Status.CHANGES);
			}
			return ord;
		});
		if (approve) {
			copyFinalToProfile(o);
		}
		return o;
	}

	// ---------- staff ----------

	/** Payment arrived: the clock starts (24 h express, else 2 or 3 days). */
	public CvOrder markPaid(Long id, String reference, String by) {
		return tx.execute(s -> {
			CvOrder o = orders.findById(id).orElseThrow(() -> ApiException.notFound("CV order"));
			if (o.getStatus() != CvOrder.Status.AWAITING_PAYMENT) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PAID", "This order is already paid.");
			}
			Quote q = quote(o.getUserId(), o.getPack(), o.isExpress());
			o.setStatus(CvOrder.Status.PAID);
			o.setPaidAt(Instant.now());
			o.setDueAt(Instant.now().plus(Duration.ofDays(q.days())));
			if (!TalentService.blank(reference)) {
				o.setPaymentReference(cut(reference, 120));
			}
			log.info("CV order #{} paid (confirmed by {})", id, by);
			return o;
		});
	}

	public CvOrder startWriting(Long id, String writer) {
		return tx.execute(s -> {
			CvOrder o = orders.findById(id).orElseThrow(() -> ApiException.notFound("CV order"));
			if (!IN_WORK.contains(o.getStatus())) {
				throw new ApiException(HttpStatus.CONFLICT, "NOT_IN_WORK", "Mark it paid first.");
			}
			o.setStatus(CvOrder.Status.WRITING);
			o.setWriter(TalentService.blank(writer) ? o.getWriter() : cut(writer, 120));
			return o;
		});
	}

	/** Staff upload a draft (sent for review, with an SMS) or the final files (order done, saved to the profile). */
	public CvOrderFile addStaffFile(Long id, CvOrderFile.Kind kind, MultipartFile upload) {
		CvOrder o = orders.findById(id).orElseThrow(() -> ApiException.notFound("CV order"));
		if (!IN_WORK.contains(o.getStatus()) && o.getStatus() != CvOrder.Status.DRAFT_SENT) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_IN_WORK", "Mark it paid first.");
		}
		CvOrderFile f = saveFile(o, kind, upload);
		tx.executeWithoutResult(s -> {
			CvOrder ord = orders.findById(id).orElseThrow();
			if (kind == CvOrderFile.Kind.DRAFT) {
				ord.setStatus(CvOrder.Status.DRAFT_SENT);
			} else if (kind == CvOrderFile.Kind.FINAL) {
				ord.setStatus(CvOrder.Status.DONE);
				ord.setDoneAt(Instant.now());
			}
		});
		if (kind == CvOrderFile.Kind.DRAFT) {
			users.findById(o.getUserId()).map(User::getPhone).ifPresent(phone -> AfterCommit.run(() -> sms.send(SmsService.Kind.JOB, phone,
					"Sodo Gebeya: your CV draft is ready to review. Open Jobs > Professional CV.", null, null)));
		}
		if (kind == CvOrderFile.Kind.FINAL) {
			copyFinalToProfile(orders.findById(id).orElseThrow());
		}
		return f;
	}

	public CvOrder cancel(Long id, String note) {
		return tx.execute(s -> {
			CvOrder o = orders.findById(id).orElseThrow(() -> ApiException.notFound("CV order"));
			if (o.getStatus() == CvOrder.Status.DONE || o.getStatus() == CvOrder.Status.CANCELLED) {
				throw new ApiException(HttpStatus.CONFLICT, "ORDER_CLOSED", "This order is already finished.");
			}
			o.setStatus(CvOrder.Status.CANCELLED);
			o.setChangeRequest(TalentService.blank(note) ? o.getChangeRequest() : "Cancelled: " + cut(note, 1400));
			return o;
		});
	}

	// ---------- helpers ----------

	private CvOrderFile saveFile(CvOrder o, CvOrderFile.Kind kind, MultipartFile upload) {
		WorkFiles.Stored st = store.store("cv-orders/" + o.getId(), upload);
		return tx.execute(s -> {
			CvOrderFile f = new CvOrderFile();
			f.setOrderId(o.getId());
			f.setKind(kind);
			f.setStorageKey(st.key());
			f.setFileName(st.fileName());
			f.setContentType(st.contentType());
			f.setSizeBytes(st.size());
			return orderFiles.save(f);
		});
	}

	/** The finished CV goes into the person's profile, so they can send it with one tap (J4). */
	private void copyFinalToProfile(CvOrder o) {
		var finals = orderFiles.findByOrderIdOrderByIdAsc(o.getId()).stream()
				.filter(f -> f.getKind() == CvOrderFile.Kind.FINAL || f.getKind() == CvOrderFile.Kind.DRAFT).toList();
		var profile = profiles.findByUserId(o.getUserId());
		if (profile.isEmpty() || finals.isEmpty()) {
			return;
		}
		boolean hasFinal = finals.stream().anyMatch(f -> f.getKind() == CvOrderFile.Kind.FINAL);
		tx.executeWithoutResult(s -> finals.stream()
				.filter(f -> !hasFinal || f.getKind() == CvOrderFile.Kind.FINAL)
				.filter(f -> f.getContentType().equals("application/pdf"))
				.filter(f -> talentFiles.findByProfileIdAndKind(profile.get().getId(), TalentFile.Kind.CV_PRO).stream()
						.noneMatch(t -> t.getStorageKey().equals(f.getStorageKey())))
				.forEach(f -> {
					TalentFile t = new TalentFile();
					t.setProfileId(profile.get().getId());
					t.setKind(TalentFile.Kind.CV_PRO);
					t.setStorageKey(f.getStorageKey());
					t.setFileName(f.getFileName());
					t.setContentType(f.getContentType());
					t.setSizeBytes(f.getSizeBytes());
					talentFiles.save(t);
				}));
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}
}
