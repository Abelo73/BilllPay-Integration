package et.tenapay.shop.work;

import java.time.Instant;
import java.time.Year;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.Features;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** J1 talent profiles, their private files, and J7 the verified-student badge. */
@Slf4j
@Service
@RequiredArgsConstructor
public class TalentService {

	static final Set<String> WORK_TYPES = Set.of("FULL_TIME", "PART_TIME", "INTERNSHIP", "WEEKEND");
	static final Set<String> WORK_PLACES = Set.of("SODO", "NEARBY", "REMOTE");

	private final TalentProfileRepository profiles;
	private final TalentExperienceRepository experience;
	private final TalentFileRepository files;
	private final UserRepository users;
	private final WorkFiles store;
	private final Features features;
	private final TransactionTemplate tx;

	public record ExperienceForm(String title, String place, String startMonth, String endMonth, String description) {
	}

	public record ProfileForm(String fullName, TalentProfile.Status status, String headline, String about, String school,
			String fieldOfStudy, Integer graduationYear, List<String> skills, List<String> languages, List<String> workTypes,
			List<String> workPlaces, Boolean publicProfile, List<ExperienceForm> experience) {
	}

	public TalentProfile mine(UUID userId) {
		return profiles.findByUserId(userId).orElse(null);
	}

	public TalentProfile requireMine(UUID userId) {
		return profiles.findByUserId(userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_PROFILE", "Make your free profile first."));
	}

	/** Creates or updates the signed-in person's profile (experience is replaced as a whole). */
	public TalentProfile save(UUID userId, ProfileForm f) {
		features.require(Features.TALENT_PROFILES);
		if (f.fullName() == null || f.fullName().isBlank()) {
			throw bad("NAME_REQUIRED", "Enter your name.");
		}
		if (f.status() == null) {
			throw bad("STATUS_REQUIRED", "Choose student, graduate, looking for work or working.");
		}
		int year = Year.now().getValue();
		if (f.graduationYear() != null && (f.graduationYear() < 1970 || f.graduationYear() > year + 8)) {
			throw bad("YEAR_INVALID", "Enter a graduation year between 1970 and " + (year + 8) + ".");
		}
		List<ExperienceForm> exp = f.experience() == null ? List.of() : f.experience();
		if (exp.size() > 10) {
			throw bad("TOO_MUCH_EXPERIENCE", "Add up to 10 jobs.");
		}
		for (ExperienceForm e : exp) {
			if (e.title() == null || e.title().isBlank()) {
				throw bad("EXPERIENCE_TITLE", "Each job needs a title.");
			}
			if (!month(e.startMonth()) || !month(e.endMonth())) {
				throw bad("MONTH_INVALID", "Use dates like 2024-06.");
			}
		}
		return tx.execute(s -> {
			TalentProfile p = profiles.findByUserId(userId).orElseGet(() -> {
				TalentProfile n = new TalentProfile();
				n.setUserId(userId);
				n.setPublicProfile(features.on(Features.PROFILE_PUBLIC_DEFAULT));
				return n;
			});
			p.setFullName(trim(f.fullName(), 120));
			p.setStatus(f.status());
			p.setHeadline(trim(f.headline(), 160));
			p.setAbout(trim(f.about(), 1500));
			p.setSchool(trim(f.school(), 160));
			p.setFieldOfStudy(trim(f.fieldOfStudy(), 160));
			p.setGraduationYear(f.graduationYear());
			p.setSkills(join(f.skills(), 30, 1000, null));
			p.setLanguages(join(f.languages(), 10, 300, null));
			p.setWorkTypes(join(f.workTypes(), 4, 120, WORK_TYPES));
			p.setWorkPlaces(join(f.workPlaces(), 3, 120, WORK_PLACES));
			if (f.publicProfile() != null) {
				p.setPublicProfile(f.publicProfile());
			}
			profiles.save(p);
			experience.deleteByProfileId(p.getId());
			for (int i = 0; i < exp.size(); i++) {
				ExperienceForm e = exp.get(i);
				TalentExperience x = new TalentExperience();
				x.setProfileId(p.getId());
				x.setTitle(trim(e.title(), 120));
				x.setPlace(trim(e.place(), 120));
				x.setStartMonth(blank(e.startMonth()) ? null : e.startMonth());
				x.setEndMonth(blank(e.endMonth()) ? null : e.endMonth());
				x.setDescription(trim(e.description(), 600));
				x.setPosition(i);
				experience.save(x);
			}
			return p;
		});
	}

	/** Deletes the profile, its files and its experience (applications already sent keep only the employer's copy of the status). */
	public void delete(UUID userId) {
		TalentProfile p = requireMine(userId);
		List<TalentFile> list = files.findByProfileIdOrderByIdDesc(p.getId());
		tx.executeWithoutResult(s -> {
			p.setPublicProfile(false);
			p.setFullName("Deleted profile");
			p.setHeadline(null);
			p.setAbout(null);
			p.setSchool(null);
			p.setFieldOfStudy(null);
			p.setSkills(null);
			p.setLanguages(null);
			p.setGraduationYear(null);
			experience.deleteByProfileId(p.getId());
			files.deleteAll(list);
			profiles.save(p);
		});
		// professional CVs stay stored: the CV order keeps its copy
		list.stream().filter(f -> f.getKind() != TalentFile.Kind.CV_PRO).forEach(f -> store.delete(f.getStorageKey()));
	}

	public TalentFile addFile(UUID userId, TalentFile.Kind kind, MultipartFile upload) {
		TalentProfile p = requireMine(userId);
		if (kind == TalentFile.Kind.CV_PRO) {
			throw bad("KIND_INVALID", "Professional CVs are added by our team.");
		}
		if (files.findByProfileIdOrderByIdDesc(p.getId()).size() >= 12) {
			throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_FILES", "Keep up to 12 files. Remove one first.");
		}
		WorkFiles.Stored st = store.store("profiles/" + p.getId(), upload);
		if (kind == TalentFile.Kind.CV_UPLOAD && !st.contentType().equals("application/pdf")) {
			store.delete(st.key());
			throw bad("PDF_ONLY", "Upload your CV as a PDF.");
		}
		TalentFile saved = tx.execute(s -> {
			TalentFile f = new TalentFile();
			f.setProfileId(p.getId());
			f.setKind(kind);
			f.setStorageKey(st.key());
			f.setFileName(st.fileName());
			f.setContentType(st.contentType());
			f.setSizeBytes(st.size());
			files.save(f);
			if (kind == TalentFile.Kind.STUDENT_ID && p.getStudentStatus() != TalentProfile.StudentStatus.APPROVED) {
				TalentProfile fresh = profiles.findById(p.getId()).orElseThrow();
				fresh.setStudentStatus(TalentProfile.StudentStatus.SUBMITTED);
				fresh.setStudentNote(null);
			}
			return f;
		});
		return saved;
	}

	public void removeFile(UUID userId, Long fileId) {
		TalentProfile p = requireMine(userId);
		TalentFile f = files.findById(fileId).filter(x -> x.getProfileId().equals(p.getId())).orElseThrow(() -> ApiException.notFound("File"));
		tx.executeWithoutResult(s -> files.delete(f));
		if (f.getKind() != TalentFile.Kind.CV_PRO) {
			store.delete(f.getStorageKey()); // a professional CV stays stored with its order
		}
	}

	/** J7: staff approve or reject the student ID. */
	public TalentProfile decideStudent(Long profileId, boolean approve, String note) {
		return tx.execute(s -> {
			TalentProfile p = profiles.findById(profileId).orElseThrow(() -> ApiException.notFound("Profile"));
			if (!approve && blank(note)) {
				throw bad("REASON_REQUIRED", "Tell the student why.");
			}
			p.setStudentStatus(approve ? TalentProfile.StudentStatus.APPROVED : TalentProfile.StudentStatus.REJECTED);
			p.setStudentVerifiedAt(approve ? Instant.now() : null);
			p.setStudentNote(approve ? null : note.trim());
			return p;
		});
	}

	/** The phone the profile's owner signed up with (shown only to the owner, staff, and employers they applied to). */
	public String phoneOf(TalentProfile p) {
		return phoneOfUser(p.getUserId());
	}

	public String phoneOfUser(UUID userId) {
		return users.findById(userId).map(User::getPhone).orElse(null);
	}

	public static List<String> split(String csv) {
		return csv == null || csv.isBlank() ? List.of() : Arrays.stream(csv.split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList();
	}

	private static String join(List<String> items, int max, int maxLength, Set<String> allowed) {
		if (items == null) {
			return null;
		}
		List<String> clean = items.stream().filter(x -> x != null && !x.isBlank()).map(x -> x.trim().replace(",", " "))
				.map(x -> x.length() > 60 ? x.substring(0, 60) : x).distinct().limit(max).toList();
		if (allowed != null && clean.stream().anyMatch(x -> !allowed.contains(x))) {
			throw bad("CHOICE_INVALID", "Pick from the list.");
		}
		String joined = clean.stream().collect(Collectors.joining(", "));
		return joined.isEmpty() ? null : joined.length() > maxLength ? joined.substring(0, maxLength) : joined;
	}

	private static boolean month(String m) {
		return m == null || m.isBlank() || m.matches("(19[7-9]\\d|20\\d\\d)-(0[1-9]|1[0-2])");
	}

	private static String trim(String s, int max) {
		if (s == null || s.isBlank()) {
			return null;
		}
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}

	static boolean blank(String s) {
		return s == null || s.isBlank();
	}

	static ApiException bad(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}
}
