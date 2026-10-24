package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Hire a pro: profiles and approval, job requests, quotes, accepting one, contact sharing, done and rating. */
class ServicesIntegrationTest extends IntegrationTest {

	private static String phone() {
		return "09" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
	}

	private String customer(String name, String phone) {
		Res r = post("/api/auth/register", Map.of("fullName", name, "email", unique("svc") + "@it.test", "phone", phone,
				"password", "Service-pass-2026"));
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.text("token");
	}

	private record Pro(String token, long id, String phone) {
	}

	private Pro pro(String name, String trade, boolean approve) {
		String phone = phone();
		String token = customer(name, phone);
		Res saved = put("/api/me/pro", Map.of("displayName", name, "trade", trade, "headline", trade + " in Sodo", "phone", phone,
				"areas", "Sodo town", "yearsExperience", 9,
				"prices", List.of(Map.of("label", "Install a socket", "priceFrom", 300), Map.of("label", "Meter box"))), token);
		assertThat(saved.status()).as(saved.raw()).isEqualTo(200);
		long id = saved.body().path("card").path("id").asLong();
		assertThat(saved.body().path("status").asString()).isEqualTo("PENDING");
		if (approve) {
			Res ok = post("/api/admin/pros/" + id + "/decision", Map.of("status", "APPROVED"), adminToken());
			assertThat(ok.status()).as(ok.raw()).isEqualTo(200);
		}
		return new Pro(token, id, "+251" + phone.substring(1));
	}

	private long postJob(String token, String trade, Long proId) {
		Map<String, Object> body = new java.util.HashMap<>(Map.of("trade", trade, "description",
				"Two sockets in the kitchen stopped working and the light flickers.", "area", "Near the university, gate 2", "timing", "TODAY"));
		if (proId != null) {
			body.put("proId", proId);
		}
		Res r = post("/api/jobs", body, token);
		assertThat(r.status()).as(r.raw()).isEqualTo(200);
		return r.body().path("id").asLong();
	}

	@Test
	void proProfilesNeedApprovalBeforeTheyShow() {
		Pro p = pro(unique("Abebe"), "ELECTRICIAN", false);
		assertThat(get("/api/pros/" + p.id()).status()).isEqualTo(404); // not public yet
		assertThat(get("/api/pros/" + p.id(), p.token()).status()).isEqualTo(200); // the owner sees it
		post("/api/admin/pros/" + p.id() + "/decision", Map.of("status", "APPROVED"), adminToken());

		JsonNode pub = get("/api/pros/" + p.id()).body();
		assertThat(pub.path("phone").isNull()).isTrue(); // phone stays private
		assertThat(pub.path("prices")).hasSize(2);
		assertThat(pub.path("card").path("priceFrom").decimalValue()).isEqualByComparingTo("300");
		assertThat(get("/api/pros?trade=ELECTRICIAN").body().path("content").findValuesAsString("displayName")).contains(pub.path("card").path("displayName").asString());
	}

	@Test
	void jobQuotesAcceptContactsAndRating() {
		Pro abebe = pro(unique("Abebe Tesfaye"), "ELECTRICIAN", true);
		Pro biniyam = pro(unique("Biniyam Kebede"), "ELECTRICIAN", true);
		Pro plumber = pro(unique("Yonas Lemma"), "PLUMBER", true);
		String customerPhone = phone();
		String customer = customer("Hana Girma", customerPhone);
		long job = postJob(customer, "ELECTRICIAN", null);

		assertThat(get("/api/pro/jobs", abebe.token()).body().path("open").findValuesAsString("description")).isNotEmpty();
		assertThat(get("/api/jobs/" + job, plumber.token()).status()).isEqualTo(404); // other trade can't see it
		assertThat(post("/api/jobs/" + job + "/quotes", Map.of("price", 400), plumber.token()).status()).isEqualTo(404);

		JsonNode q1 = post("/api/jobs/" + job + "/quotes", Map.of("price", 650, "message", "Can come today", "available", "Today 3 PM"), abebe.token()).body();
		assertThat(q1.path("myQuote").path("status").asString()).isEqualTo("SENT");
		assertThat(post("/api/jobs/" + job + "/quotes", Map.of("price", 600), abebe.token()).text("code")).isEqualTo("ALREADY_QUOTED");
		post("/api/jobs/" + job + "/quotes", Map.of("price", 500), biniyam.token());

		JsonNode view = get("/api/jobs/" + job, customer).body();
		assertThat(view.path("quotes")).hasSize(2);
		assertThat(view.path("quotes").findValues("proPhone")).allMatch(JsonNode::isNull); // no phones before accepting
		long abebeQuote = view.path("quotes").get(0).path("id").asLong();

		JsonNode accepted = post("/api/jobs/" + job + "/accept/" + abebeQuote, Map.of(), customer).body();
		assertThat(accepted.path("status").asString()).isEqualTo("ASSIGNED");
		assertThat(accepted.path("quotes").get(0).path("proPhone").asString()).isEqualTo(abebe.phone());
		assertThat(accepted.path("quotes").get(1).path("status").asString()).isEqualTo("DECLINED");
		assertThat(post("/api/jobs/" + job + "/accept/" + abebeQuote, Map.of(), customer).text("code")).isEqualTo("JOB_CLOSED");

		assertThat(get("/api/jobs/" + job, abebe.token()).body().path("customerPhone").asString()).isEqualTo("+251" + customerPhone.substring(1));
		assertThat(get("/api/jobs/" + job, biniyam.token()).body().path("customerPhone").isNull()).isTrue();

		JsonNode done = post("/api/jobs/" + job + "/done", Map.of("rating", 5, "review", "Fixed it fast"), customer).body();
		assertThat(done.path("status").asString()).isEqualTo("DONE");
		JsonNode card = get("/api/pros/" + abebe.id()).body().path("card");
		assertThat(card.path("jobsDone").asInt()).isEqualTo(1);
		assertThat(card.path("rating").decimalValue()).isEqualByComparingTo("5.0");
	}

	@Test
	void directRequestsReachOnlyThatProAndNobodyQuotesOwnJobs() {
		Pro abebe = pro(unique("Abebe D"), "ELECTRICIAN", true);
		Pro other = pro(unique("Other E"), "ELECTRICIAN", true);
		Pro pending = pro(unique("Pending P"), "ELECTRICIAN", false);
		String customer = customer("Selam Tadesse", phone());

		long direct = postJob(customer, "ELECTRICIAN", abebe.id());
		assertThat(get("/api/jobs/" + direct, abebe.token()).body().path("direct").asBoolean()).isTrue();
		assertThat(get("/api/jobs/" + direct, other.token()).status()).isEqualTo(404);
		assertThat(post("/api/jobs/" + direct + "/quotes", Map.of("price", 400), pending.token()).text("code")).isEqualTo("NOT_A_PRO");

		long own = postJob(abebe.token(), "ELECTRICIAN", null);
		assertThat(post("/api/jobs/" + own + "/quotes", Map.of("price", 100), abebe.token()).status()).isEqualTo(404);
		assertThat(post("/api/jobs", Map.of("trade", "ELECTRICIAN", "description", "short", "area", "x", "timing", "TODAY"), customer).text("code"))
				.isEqualTo("MISSING_FIELDS");
		assertThat(post("/api/jobs/" + direct + "/cancel", Map.of(), customer).body().path("status").asString()).isEqualTo("CANCELLED");
	}
}
