package et.tenapay.shop.billpaylab;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.payment.billpay.BillPayPayloads;
import et.tenapay.shop.payment.billpay.BillPayPayment;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/**
 * Admin → BillPay lab → Scenario run: one sandbox payment per BillPay test case, each with what to type on BillPay's
 * checkout and what should happen. The outcome depends on what a person types there, so the run cannot pay by itself;
 * it checks BillPay for every waiting payment and marks each case passed or failed. After the plain payment passes, it
 * can also test refunds (accepted, and refused for an amount ending in .13).
 */
@Service
@RequiredArgsConstructor
public class BillPayScenarioService {

	/** How each scenario is told apart: the description "Scenario KEY #batch: title". No extra table needed. */
	private static final Pattern TAG = Pattern.compile("^Scenario ([A-Z_]+) #(\\d{6}-\\d{6}): ");
	private static final DateTimeFormatter BATCH = DateTimeFormatter.ofPattern("yyMMdd-HHmmss").withZone(ZoneId.of("Africa/Addis_Ababa"));
	private static final BigDecimal AMOUNT = new BigDecimal("25.00");
	static final BigDecimal REFUND_OK = new BigDecimal("1.00");
	static final BigDecimal REFUND_REFUSED = new BigDecimal("1.13");

	/** expectReason null + paid true = should be paid; expectReason set = refused with that code; neither = never answers. */
	public enum Scenario {
		PAID("Paid", "Test Wallet, any normal number (or card tok_success)", true, null),
		INSUFFICIENT_FUNDS("Not enough money", "A number ending in 0000 (or tok_insufficient_funds)", false, "INSUFFICIENT_FUNDS"),
		CUSTOMER_DECLINED("Customer declines", "A number ending in 1111 (or tok_declined)", false, "CUSTOMER_DECLINED"),
		ACCOUNT_BLOCKED("Blocked account", "A number ending in 2222", false, "ACCOUNT_BLOCKED"),
		LIMIT_EXCEEDED("Over the limit", "A number ending in 3333", false, "LIMIT_EXCEEDED"),
		CARD_EXPIRED("Expired card", "Card token tok_expired_card", false, "CARD_EXPIRED"),
		SLOW_PAID("Paid after two minutes", "A number ending in 8888, then wait about two minutes", true, null),
		NO_ANSWER("Never answers", "A number ending in 9999 (or tok_timeout); it expires after 30 minutes", false, null);

		final String title;
		final String howTo;
		final boolean paid;
		final String reason;

		Scenario(String title, String howTo, boolean paid, String reason) {
			this.title = title;
			this.howTo = howTo;
			this.paid = paid;
			this.reason = reason;
		}

		String expected() {
			return paid ? "Paid" : reason != null ? "Refused: " + reason : "Stays waiting, then EXPIRED";
		}
	}

	/** PASS / FAIL / WAITING (not decided yet) / NOT_STARTED (BillPay never created the payment) */
	public record Row(String key, String title, String howTo, String expected, UUID runId, String merchantReference,
			String checkoutUrl, String status, String reasonCode, String verdict, String note) {
	}

	public record RefundCheck(String key, String title, BigDecimal amount, String expected, Integer httpStatus, String verdict,
			String note) {
	}

	public record Board(String batch, List<Row> rows, List<RefundCheck> refunds, int passed, int failed, int waiting) {
	}

	private final BillPayLabService lab;
	private final JdbcTemplate jdbc;
	private final ObjectMapper json;

	/** Starts a new run: one sandbox payment per scenario (sandbox only: these never move real money). */
	public Board start(String staff) {
		String batch = BATCH.format(Instant.now());
		for (Scenario s : Scenario.values()) {
			lab.create(BillPayEnvironment.SANDBOX, AMOUNT, "Scenario " + s.name() + " #" + batch + ": " + s.title, null, null,
					false, staff);
		}
		return board();
	}

	/** Asks BillPay about every scenario of the latest run that is still waiting. */
	public Board check() {
		Board b = board();
		for (Row r : b.rows()) {
			if ("WAITING".equals(r.verdict()) && r.runId() != null) {
				lab.refresh(r.runId());
			}
		}
		return board();
	}

	/** Once "Paid" passed: refund 1.13 (BillPay's sandbox refuses it) and 1.00 (should be accepted) on that payment. */
	public Board refunds() {
		Board b = board();
		Row paid = b.rows().stream().filter(r -> r.key().equals(Scenario.PAID.name())).findFirst().orElse(null);
		if (paid == null || !"PASS".equals(paid.verdict())) {
			throw new ApiException(HttpStatus.CONFLICT, "PAY_FIRST", "Pay the \"Paid\" scenario first; refunds need a paid payment.");
		}
		lab.refund(paid.runId(), REFUND_REFUSED, "Scenario run: refused refund");
		lab.refund(paid.runId(), REFUND_OK, "Scenario run: refund");
		return board();
	}

	/** The latest run, read back from the lab payments and their calls. */
	public Board board() {
		List<Map<String, Object>> runs = jdbc.queryForList("""
				select r.id, r.description, r.merchant_reference, r.checkout_url, r.status,
				       (select c.response from billpay_lab_calls c where c.run_id = r.id and c.operation = 'get_payment'
				         and c.http_status < 300 order by c.id desc limit 1) last_answer
				from billpay_lab_runs r
				where r.environment = 'SANDBOX' and r.description like 'Scenario %'
				order by r.created_at desc limit 40""");
		String batch = null;
		Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
		for (Map<String, Object> run : runs) {
			Matcher m = TAG.matcher(String.valueOf(run.get("description")));
			if (!m.find()) {
				continue;
			}
			if (batch == null) {
				batch = m.group(2);
			}
			if (batch.equals(m.group(2))) {
				byKey.putIfAbsent(m.group(1), run);
			}
		}
		List<Row> rows = new ArrayList<>();
		int passed = 0;
		int failed = 0;
		int waiting = 0;
		for (Scenario s : Scenario.values()) {
			Map<String, Object> run = byKey.get(s.name());
			Row row = run == null ? new Row(s.name(), s.title, s.howTo, s.expected(), null, null, null, null, null, null, null)
					: row(s, run);
			rows.add(row);
			if ("PASS".equals(row.verdict())) {
				passed++;
			} else if ("FAIL".equals(row.verdict()) || "NOT_STARTED".equals(row.verdict())) {
				failed++;
			} else if ("WAITING".equals(row.verdict())) {
				waiting++;
			}
		}
		Row paid = rows.get(0);
		return new Board(batch, rows, paid.runId() == null ? List.of() : refundChecks(paid.runId()), passed, failed, waiting);
	}

	private Row row(Scenario s, Map<String, Object> run) {
		UUID id = (UUID) run.get("id");
		String status = (String) run.get("status");
		String reason = reasonFrom((String) run.get("last_answer"));
		String[] verdict = verdict(s, status, reason);
		return new Row(s.name(), s.title, s.howTo, s.expected(), id, (String) run.get("merchant_reference"),
				(String) run.get("checkout_url"), status, reason, verdict[0], verdict[1]);
	}

	/** {verdict, note}. Pure, so the rules are easy to read and test. */
	static String[] verdict(Scenario s, String status, String reason) {
		String st = status == null ? "" : status.toUpperCase();
		boolean paid = st.matches(".*(CAPTURED|SUCCEEDED|PAID|COMPLETED).*");
		boolean expired = st.contains("EXPIRED");
		boolean failedStatus = st.matches(".*(FAIL|DECLINED|CANCEL).*");
		if (st.equals("CREATE_FAILED") || st.equals("NEW")) {
			return new String[] { "NOT_STARTED", "BillPay did not create this payment; see its calls." };
		}
		if (s.paid) {
			if (paid) {
				return new String[] { "PASS", null };
			}
			if (reason != null || failedStatus || expired) {
				return new String[] { "FAIL", "Expected paid, BillPay says " + st + (reason == null ? "" : " (" + reason + ")") };
			}
			return new String[] { "WAITING", null };
		}
		if (s.reason != null) {
			if (s.reason.equalsIgnoreCase(reason)) {
				return new String[] { "PASS", null };
			}
			if (paid || reason != null) {
				return new String[] { "FAIL", "Expected " + s.reason + ", BillPay says " + st + (reason == null ? "" : " (" + reason + ")") };
			}
			return new String[] { "WAITING", failedStatus ? "Refused, but BillPay gave no reason code yet" : null };
		}
		// never answers: must not be paid or refused; passes once BillPay lets it expire
		if (paid || reason != null) {
			return new String[] { "FAIL", "Expected no answer, BillPay says " + st + (reason == null ? "" : " (" + reason + ")") };
		}
		return expired ? new String[] { "PASS", null } : new String[] { "WAITING", "Passes when BillPay marks it EXPIRED (about 30 minutes)" };
	}

	private List<RefundCheck> refundChecks(UUID paidRun) {
		List<Map<String, Object>> calls = jdbc.queryForList(
				"select request, response, http_status from billpay_lab_calls where run_id = ? and operation = 'create_refund' order by id",
				paidRun);
		Map<String, Object> refused = null;
		Map<String, Object> ok = null;
		for (Map<String, Object> c : calls) {
			BigDecimal amt = amountOf((String) c.get("request"));
			if (amt != null && amt.compareTo(REFUND_REFUSED) == 0) {
				refused = c;
			} else if (amt != null && amt.compareTo(REFUND_OK) == 0) {
				ok = c;
			}
		}
		return List.of(
				refundCheck("REFUND_OK", "Refund accepted", REFUND_OK, "Accepted (2xx)", ok, false),
				refundCheck("REFUND_REFUSED", "Refund refused", REFUND_REFUSED, "Refused: REFUND_REFUSED", refused, true));
	}

	private static RefundCheck refundCheck(String key, String title, BigDecimal amount, String expected, Map<String, Object> call,
			boolean shouldRefuse) {
		if (call == null) {
			return new RefundCheck(key, title, amount, expected, null, null, null);
		}
		Integer http = (Integer) call.get("http_status");
		String body = String.valueOf(call.get("response"));
		boolean accepted = http != null && http < 300;
		boolean saysRefused = body.contains("REFUND_REFUSED");
		String verdict;
		String note = null;
		if (shouldRefuse) {
			if (!accepted || saysRefused) {
				verdict = "PASS";
			} else {
				verdict = "WAITING";
				note = "BillPay took it for review (HTTP " + http + "); the refusal may come later as a webhook. Check the Paid payment.";
			}
		} else {
			verdict = accepted && !saysRefused ? "PASS" : "FAIL";
			if (!"PASS".equals(verdict)) {
				note = "BillPay answered HTTP " + (http == null ? "none" : http);
			}
		}
		return new RefundCheck(key, title, amount, expected, http, verdict, note);
	}

	private String reasonFrom(String raw) {
		if (raw == null) {
			return null;
		}
		try {
			BillPayPayment p = BillPayPayloads.parsePayment(json.readTree(raw), raw);
			return p.reasonCode();
		} catch (RuntimeException e) {
			return null;
		}
	}

	private BigDecimal amountOf(String request) {
		try {
			return request == null ? null : json.readTree(request).path("amount").decimalValue();
		} catch (RuntimeException e) {
			return null;
		}
	}
}
