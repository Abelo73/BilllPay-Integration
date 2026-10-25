package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Jobs and CVs (J1–J7): profile, free CV data, job posts checked by staff, one-tap apply, CV orders, student badge. */
class WorkIntegrationTest extends IntegrationTest {

	private static final byte[] PDF = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF".getBytes(StandardCharsets.US_ASCII);

	private String person(String name, String phone) {
		return post("/api/auth/register", Map.of("fullName", name, "email", unique("w") + "@it.test", "phone", phone,
				"password", "Work-pass-2026")).body().path("token").asString();
	}

	private Map<String, Object> profile(String name) {
		Map<String, Object> p = new LinkedHashMap<>();
		p.put("fullName", name);
		p.put("status", "GRADUATE");
		p.put("headline", "Accountant, fresh graduate");
		p.put("school", "Wolaita Sodo University");
		p.put("fieldOfStudy", "Accounting");
		p.put("graduationYear", 2025);
		p.put("skills", List.of("Excel", "Peachtree", "Customer service"));
		p.put("languages", List.of("Amharic", "English", "Wolaytta"));
		p.put("workTypes", List.of("FULL_TIME"));
		p.put("workPlaces", List.of("SODO"));
		p.put("experience", List.of(Map.of("title", "Intern accountant", "place", "Sodo bank", "startMonth", "2024-06", "endMonth", "2024-09")));
		return p;
	}

	private Map<String, Object> job(String title) {
		Map<String, Object> j = new LinkedHashMap<>();
		j.put("employerName", "Sodo Pharmacy");
		j.put("title", title);
		j.put("place", "Wolaita Sodo");
		j.put("type", "FULL_TIME");
		j.put("field", "Accounting");
		j.put("description", "Keep the books for our two pharmacies.");
		j.put("deadline", LocalDate.now().plusDays(14).toString());
		return j;
	}

	@Test
	void profileApplyAndHire() {
		String admin = adminToken();
		String seeker = person("Meron Tadesse", "0913111222");
		String employer = person("Sodo Pharmacy", "0913333444");

		assertThat(get("/api/work/profile", seeker).text("code")).isEqualTo("NO_PROFILE");
		assertThat(get("/api/work/profile").status()).isEqualTo(401);
		assertThat(put("/api/work/profile", Map.of("status", "GRADUATE"), seeker).text("code")).isEqualTo("NAME_REQUIRED");
		Map<String, Object> bad = profile("Meron");
		bad.put("workPlaces", List.of("MARS"));
		assertThat(put("/api/work/profile", bad, seeker).text("code")).isEqualTo("CHOICE_INVALID");

		JsonNode p = put("/api/work/profile", profile("Meron Tadesse"), seeker).body();
		assertThat(p.path("skills").size()).isEqualTo(3);
		assertThat(p.path("experience").get(0).path("title").asString()).isEqualTo("Intern accountant");
		assertThat(p.path("phone").asString()).isEqualTo("+251913111222");
		assertThat(p.path("publicProfile").asBoolean()).isFalse(); // private by default

		// a CV upload must be a PDF
		assertThat(upload("/api/work/profile/files?kind=CV_UPLOAD", "cv.txt", "text/plain", "hello".getBytes(), seeker).status())
				.isEqualTo(400);
		JsonNode withCv = upload("/api/work/profile/files?kind=CV_UPLOAD", "Meron CV.pdf", "application/pdf", PDF, seeker).body();
		long cvFile = withCv.path("files").get(0).path("id").asLong();
		assertThat(get("/api/work/profile/files/" + cvFile, employer).text("code")).isEqualTo("NO_PROFILE");

		// a post asking applicants for money is refused; the first post is free and waits for staff
		Map<String, Object> scam = job("Cashier");
		scam.put("requirements", "Pay a registration fee of 500 birr");
		assertThat(post("/api/work/my-jobs", scam, employer).text("code")).isEqualTo("NO_FEES_FOR_APPLICANTS");
		JsonNode posted = post("/api/work/my-jobs", job(unique("Accountant")), employer).body();
		long jobId = posted.path("id").asLong();
		assertThat(posted.path("status").asString()).isEqualTo("PENDING");
		assertThat(posted.path("feePaid").asBoolean()).isTrue();
		assertThat(get("/api/work/jobs/" + jobId).status()).isEqualTo(404);

		// the second post costs the job post price and can't go live until paid
		long second = post("/api/work/my-jobs", job(unique("Pharmacist")), employer).body().path("id").asLong();
		assertThat(post("/api/admin/work/jobs/" + second, Map.of("status", "LIVE"), admin).text("code")).isEqualTo("FEE_NOT_PAID");
		assertThat(post("/api/admin/work/jobs/" + second, Map.of("status", "LIVE", "markPaid", true), admin).status()).isEqualTo(200);

		assertThat(get("/api/admin/work/counts", admin).body().path("jobsPending").asLong()).isGreaterThanOrEqualTo(1);
		assertThat(post("/api/admin/work/jobs/" + jobId, Map.of("status", "LIVE", "featured", true), admin).body().path("status").asString())
				.isEqualTo("LIVE");
		JsonNode list = get("/api/work/jobs?q=accountant").body();
		assertThat(list.path("content").toString()).contains("Sodo Pharmacy");
		assertThat(list.path("content").get(0).path("featured").asBoolean()).isTrue();
		assertThat(list.path("content").get(0).path("fee").isNull()).isTrue(); // the fee is only for the employer

		// one tap apply with the auto CV; twice is refused; own job refused
		assertThat(post("/api/work/jobs/" + jobId + "/apply", Map.of(), employer).text("code")).isEqualTo("NO_PROFILE");
		JsonNode applied = post("/api/work/jobs/" + jobId + "/apply", Map.of("cvKind", "FILE", "cvFileId", cvFile, "message", "Ready to start"), seeker).body();
		long appId = applied.path("id").asLong();
		assertThat(applied.path("status").asString()).isEqualTo("NEW");
		assertThat(post("/api/work/jobs/" + jobId + "/apply", Map.of(), seeker).text("code")).isEqualTo("ALREADY_APPLIED");
		assertThat(get("/api/work/jobs/" + jobId, seeker).body().path("applied").asBoolean()).isTrue();
		assertThat(get("/api/work/applications", seeker).body().get(0).path("job").path("title").asString()).startsWith("Accountant");

		// the employer sees the applicant with phone and CV; others don't
		JsonNode inbox = get("/api/work/my-jobs/" + jobId + "/applications", employer).body();
		assertThat(inbox.get(0).path("applicant").path("fullName").asString()).isEqualTo("Meron Tadesse");
		assertThat(inbox.get(0).path("applicant").path("phone").asString()).isEqualTo("+251913111222");
		assertThat(getBytes("/api/work/applications/" + appId + "/cv").statusCode()).isEqualTo(401);
		assertThat(get("/api/work/my-jobs/" + jobId + "/applications", seeker).status()).isEqualTo(404);
		long profileId = inbox.get(0).path("applicant").path("id").asLong();
		assertThat(get("/api/work/profiles/" + profileId, employer).body().path("phone").asString()).isEqualTo("+251913111222");
		String stranger = person("Stranger", "0913555666");
		assertThat(get("/api/work/profiles/" + profileId, stranger).status()).isEqualTo(404);

		assertThat(post("/api/work/applications/" + appId + "/status", Map.of("status", "INTERVIEW"), seeker).status()).isEqualTo(404);
		assertThat(post("/api/work/applications/" + appId + "/status", Map.of("status", "INTERVIEW"), employer).body().path("status").asString())
				.isEqualTo("INTERVIEW");
		assertThat(get("/api/work/applications", seeker).body().get(0).path("status").asString()).isEqualTo("INTERVIEW");

		// talent search: only for employers, only public profiles
		assertThat(get("/api/work/talent", stranger).text("code")).isEqualTo("EMPLOYERS_ONLY");
		assertThat(get("/api/work/talent?q=Peachtree", employer).body().path("content").size()).isZero();
		Map<String, Object> pub = profile("Meron Tadesse");
		pub.put("publicProfile", true);
		put("/api/work/profile", pub, seeker);
		JsonNode found = get("/api/work/talent?q=Peachtree", employer).body().path("content");
		assertThat(found.size()).isEqualTo(1);
		assertThat(found.get(0).path("phone").isNull()).isTrue(); // phone only after they apply

		// closing a job takes it off the board
		post("/api/work/my-jobs/" + jobId + "/close", Map.of(), employer);
		assertThat(get("/api/work/jobs/" + jobId).status()).isEqualTo(404);

		// staff can't use customer endpoints
		assertThat(get("/api/work/profile", admin).text("code")).isEqualTo("CUSTOMERS_ONLY");
	}

	@Test
	void professionalCvOrder_andStudentBadge() {
		String admin = adminToken();
		String student = person("Abebe Kebede", "0914111222");
		put("/api/work/profile", profile("Abebe Kebede"), student);

		JsonNode quote = get("/api/work/cv-orders/quote?pack=COVER&express=true", student).body();
		assertThat(quote.path("total").decimalValue()).isEqualByComparingTo("449"); // 349 + 100 express
		assertThat(post("/api/work/cv-orders", Map.of("pack", "BASIC", "language", "BOTH"), student).status()).isEqualTo(400);

		JsonNode order = post("/api/work/cv-orders", Map.of("pack", "BASIC", "language", "EN", "targetJob", "Accountant"), student).body();
		long orderId = order.path("id").asLong();
		assertThat(order.path("status").asString()).isEqualTo("AWAITING_PAYMENT");
		assertThat(post("/api/work/cv-orders/" + orderId + "/payment-reference", Map.of("reference", "TB12345678"), student).body()
				.path("paymentReference").asString()).isEqualTo("TB12345678");
		assertThat(upload("/api/work/cv-orders/" + orderId + "/files", "old.pdf", "application/pdf", PDF, student).body()
				.path("files").size()).isEqualTo(1);

		// staff: mark paid, write, send the draft, the customer asks for a change, then approves the final
		assertThat(get("/api/admin/work/cv-orders?show=unpaid", admin).body().path("content").toString()).contains("Abebe Kebede");
		assertThat(post("/api/admin/work/cv-orders/" + orderId, Map.of("action", "paid"), admin).body().path("order").path("status").asString())
				.isEqualTo("PAID");
		post("/api/admin/work/cv-orders/" + orderId, Map.of("action", "writing", "writer", "Hana"), admin);
		assertThat(upload("/api/admin/work/cv-orders/" + orderId + "/files?kind=DRAFT", "draft.pdf", "application/pdf", PDF, admin).body()
				.path("order").path("status").asString()).isEqualTo("DRAFT_SENT");
		assertThat(post("/api/work/cv-orders/" + orderId + "/respond", Map.of("approve", false, "changes", "Add my internship"), student)
				.body().path("status").asString()).isEqualTo("CHANGES");
		assertThat(post("/api/work/cv-orders/" + orderId + "/respond", Map.of("approve", false, "changes", "Again"), student).status())
				.isEqualTo(409); // Basic: one round of changes
		assertThat(upload("/api/admin/work/cv-orders/" + orderId + "/files?kind=FINAL", "Abebe CV.pdf", "application/pdf", PDF, admin).body()
				.path("order").path("status").asString()).isEqualTo("DONE");
		JsonNode files = get("/api/work/profile", student).body().path("files");
		assertThat(files.toString()).contains("CV_PRO");

		// J7: student ID → staff approve → verified badge
		Map<String, Object> st = profile("Abebe Kebede");
		st.put("status", "STUDENT");
		put("/api/work/profile", st, student);
		JsonNode withId = upload("/api/work/profile/files?kind=STUDENT_ID", "id.pdf", "application/pdf", PDF, student).body();
		assertThat(withId.path("studentStatus").asString()).isEqualTo("SUBMITTED");
		long profileId = withId.path("id").asLong();
		assertThat(post("/api/admin/work/students/" + profileId, Map.of("approve", false), admin).text("code")).isEqualTo("REASON_REQUIRED");
		assertThat(post("/api/admin/work/students/" + profileId, Map.of("approve", true), admin).body().path("studentStatus").asString())
				.isEqualTo("APPROVED");
		assertThat(get("/api/work/profile", student).body().path("verifiedStudent").asBoolean()).isTrue();

		// switches: CV service off hides it
		put("/api/admin/features/cv_service", Map.of("value", "false"), admin);
		try {
			assertThat(get("/api/work/cv-orders/quote?pack=BASIC", student).text("code")).isEqualTo("FEATURE_OFF");
		} finally {
			put("/api/admin/features/cv_service", Map.of("value", "true"), admin);
		}
	}
}
