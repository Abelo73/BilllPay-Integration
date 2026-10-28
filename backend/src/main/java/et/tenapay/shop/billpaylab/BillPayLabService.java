package et.tenapay.shop.billpaylab;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.payment.billpay.BillPayClient;
import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.payment.billpay.BillPayException;
import et.tenapay.shop.payment.billpay.BillPayPayment;
import et.tenapay.shop.payment.billpay.BillPayProperties;
import et.tenapay.shop.payment.billpay.BillPayRefund;
import et.tenapay.shop.webhook.WebhookEvent;
import et.tenapay.shop.webhook.WebhookEventRepository;
import lombok.RequiredArgsConstructor;

/**
 * Admin → BillPay lab: makes test payments straight against BillPay (no order, no stock), keeps every API call with
 * its timing, and shows the webhooks BillPay sent for it. For learning and demonstrating how BillPay behaves.
 */
@Service
@RequiredArgsConstructor
public class BillPayLabService {

	static final BigDecimal MAX_LIVE_AMOUNT = new BigDecimal("1000.00");
	private static final DateTimeFormatter REF_TIME = DateTimeFormatter.ofPattern("yyMMdd-HHmmss").withZone(ZoneId.of("Africa/Addis_Ababa"));
	private static final Pattern STATUS_CODE = Pattern.compile("\"statusCode\"\\s*:\\s*(\\d{3})");
	/** A payment id that cannot exist, used only to test the API key. */
	static final String KEY_CHECK_PAYMENT_ID = "00000000-0000-0000-0000-000000000000";
	static final Pattern REFERENCE = Pattern.compile("^LAB-\\d{6}-\\d{6}-[A-Z0-9]{4}$");

	private final BillPayClient billPay;
	private final JdbcTemplate jdbc;
	private final AppProperties app;
	private final WebhookEventRepository webhooks;
	private final BillPayProperties billPayProps;

	public record Call(long id, String operation, Integer httpStatus, int durationMs, String request, String response,
			String error, Instant at) {
	}

	public record Hook(String eventType, String status, Boolean signatureValid, String signatureScheme, String note,
			Instant receivedAt, Long secondsAfterCreate, String payload) {
	}

	public record Run(UUID id, String environment, String merchantReference, String billpayPaymentId, BigDecimal amount,
			String description, String status, String checkoutUrl, String createdBy, Instant createdAt, Instant updatedAt) {
	}

	public record RunDetail(Run run, List<Call> calls, List<Hook> webhooks) {
	}

	/** Creates a hosted-checkout payment on BillPay. Live payments move real money, so they need a confirm and a cap. */
	public RunDetail create(BillPayEnvironment env, BigDecimal amount, String description, String customerName,
			String customerPhone, boolean confirmLive, String staff) {
		BigDecimal amt = amount == null ? null : amount.setScale(2, RoundingMode.HALF_UP);
		if (amt == null || amt.compareTo(BigDecimal.ONE) < 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Enter an amount of at least 1.00 ETB.");
		}
		if (env == BillPayEnvironment.LIVE) {
			if (!confirmLive) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "CONFIRM_LIVE", "A live payment moves real money. Tick the confirm box.");
			}
			if (amt.compareTo(MAX_LIVE_AMOUNT) > 0) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "LIVE_AMOUNT_TOO_HIGH",
						"Live lab payments are capped at " + MAX_LIVE_AMOUNT.toPlainString() + " ETB.");
			}
		}
		UUID id = UUID.randomUUID();
		String ref = "LAB-" + REF_TIME.format(Instant.now()) + "-" + randomCode();
		String desc = description == null || description.isBlank() ? "BillPay lab test" : description.trim();
		jdbc.update("""
				insert into billpay_lab_runs (id, environment, merchant_reference, amount, description, status, created_by)
				values (?, ?, ?, ?, ?, 'NEW', ?)""", id, env.name(), ref, amt, desc, staff);

		String base = baseFor(ref);
		String body = billPay.toJson(new BillPayClient.CreatePaymentRequest(ref, amt, "ETB", desc,
				new BillPayClient.Customer(blankToNull(customerName, "Lab Tester"),
						blankToNull(customerPhone, "+251911000000"), "lab@sodogebeya.et"),
				base, base));
		BillPayPayment p = record(id, "create_payment", body, () -> billPay.createPayment(env, body, UUID.randomUUID()),
				BillPayPayment::raw);
		if (p != null) {
			jdbc.update("update billpay_lab_runs set billpay_payment_id = ?, status = ?, checkout_url = ?, updated_at = now() where id = ?",
					p.paymentId(), p.status(), p.checkoutUrl(), id);
		} else {
			jdbc.update("update billpay_lab_runs set status = 'CREATE_FAILED', updated_at = now() where id = ?", id);
		}
		return detail(id);
	}

	/** Asks BillPay for the payment's current status (GET /payments/{id}). */
	public RunDetail refresh(UUID id) {
		Run run = run(id);
		if (run.billpayPaymentId() == null) {
			throw new ApiException(HttpStatus.CONFLICT, "NO_PAYMENT", "BillPay never created this payment.");
		}
		BillPayEnvironment env = BillPayEnvironment.valueOf(run.environment());
		BillPayPayment p = record(id, "get_payment", null, () -> billPay.getPayment(env, run.billpayPaymentId()), BillPayPayment::raw);
		if (p != null && p.status() != null) {
			jdbc.update("update billpay_lab_runs set status = ?, updated_at = now() where id = ?", p.status(), id);
		}
		return detail(id);
	}

	/** Refunds part or all of a lab payment (body {"amount", "reason"}, the only shape BillPay accepts). */
	public RunDetail refund(UUID id, BigDecimal amount, String reason) {
		Run run = run(id);
		if (run.billpayPaymentId() == null) {
			throw new ApiException(HttpStatus.CONFLICT, "NO_PAYMENT", "BillPay never created this payment.");
		}
		BigDecimal amt = amount == null ? run.amount() : amount.setScale(2, RoundingMode.HALF_UP);
		BillPayEnvironment env = BillPayEnvironment.valueOf(run.environment());
		String body = billPay.toJson(Map.of("amount", amt, "reason", reason == null || reason.isBlank() ? "Lab refund" : reason.trim()));
		record(id, "create_refund", body, () -> billPay.createRefund(env, run.billpayPaymentId(), body, UUID.randomUUID()),
				BillPayRefund::raw);
		return detail(id);
	}

	/** One environment's key check: does BillPay accept our API key, and how fast does it answer? */
	public record KeyCheck(String environment, boolean configured, String verdict, Integer httpStatus, Integer durationMs,
			String message) {
	}

	/**
	 * Asks BillPay, in each environment, for a payment that does not exist. "Not found" means the key was accepted;
	 * 401/403 means BillPay rejected the key. Nothing is created and nothing is kept.
	 */
	public List<KeyCheck> checkKeys() {
		List<KeyCheck> out = new ArrayList<>();
		for (BillPayEnvironment env : BillPayEnvironment.values()) {
			if (!billPayProps.credentials(env).hasApiKey()) {
				out.add(new KeyCheck(env.name(), false, "NOT_SET", null, null,
						"BILLPAY_" + env.name() + "_API_KEY is empty in .env."));
				continue;
			}
			long started = System.nanoTime();
			String verdict;
			Integer status;
			String message;
			try {
				billPay.getPayment(env, KEY_CHECK_PAYMENT_ID);
				verdict = "OK";
				status = 200;
				message = "Key accepted.";
			} catch (BillPayException e) {
				status = e.isNetworkError() ? null : e.getHttpStatus();
				verdict = keyVerdict(status);
				message = switch (verdict) {
					case "OK" -> "Key accepted (BillPay answered " + status + " for a made-up payment, as expected).";
					case "KEY_REJECTED" -> "BillPay rejected the key. Copy a fresh key into .env and restart.";
					case "UNREACHABLE" -> "No answer from BillPay: " + cut(e.getMessage(), 200);
					default -> "BillPay answered HTTP " + status + ": " + cut(e.getResponseBody(), 200);
				};
			} catch (RuntimeException e) {
				status = null;
				verdict = "UNEXPECTED";
				message = cut(e.getClass().getSimpleName() + ": " + e.getMessage(), 200);
			}
			out.add(new KeyCheck(env.name(), true, verdict, status, (int) ((System.nanoTime() - started) / 1_000_000), message));
		}
		return out;
	}

	static String keyVerdict(Integer status) {
		if (status == null || status == 0) {
			return "UNREACHABLE";
		}
		if (status == 401 || status == 403) {
			return "KEY_REJECTED";
		}
		if (status < 300 || status == 400 || status == 404 || status == 422) {
			return "OK";
		}
		return "BILLPAY_ERROR";
	}

	/** How fast and how reliable each BillPay call has been, per environment and operation. */
	public record OpStats(String environment, String operation, int calls, int ok, int failed, int noAnswer, int avgMs,
			int p95Ms, int maxMs) {
	}

	public record StatusCount(String environment, String status, int runs) {
	}

	public record Stats(List<OpStats> operations, List<StatusCount> outcomes) {
	}

	public Stats stats() {
		List<OpStats> ops = jdbc.query("""
				select r.environment, c.operation, count(*) calls,
				       count(*) filter (where c.http_status < 300) ok,
				       count(*) filter (where c.http_status >= 300) failed,
				       count(*) filter (where c.http_status is null) no_answer,
				       coalesce(round(avg(c.duration_ms)), 0) avg_ms,
				       coalesce(round(percentile_cont(0.95) within group (order by c.duration_ms)), 0) p95_ms,
				       coalesce(max(c.duration_ms), 0) max_ms
				from billpay_lab_calls c join billpay_lab_runs r on r.id = c.run_id
				group by r.environment, c.operation
				order by r.environment, c.operation""",
				(rs, i) -> new OpStats(rs.getString("environment"), rs.getString("operation"), rs.getInt("calls"), rs.getInt("ok"),
						rs.getInt("failed"), rs.getInt("no_answer"), rs.getInt("avg_ms"), rs.getInt("p95_ms"), rs.getInt("max_ms")));
		List<StatusCount> outcomes = jdbc.query("""
				select environment, coalesce(status, 'NEW') status, count(*) runs
				from billpay_lab_runs group by environment, coalesce(status, 'NEW')
				order by environment, runs desc""",
				(rs, i) -> new StatusCount(rs.getString("environment"), rs.getString("status"), rs.getInt("runs")));
		return new Stats(ops, outcomes);
	}

	public List<Run> recent() {
		return jdbc.query("select * from billpay_lab_runs order by created_at desc limit 50", (rs, i) -> mapRun(rs));
	}

	public RunDetail detail(UUID id) {
		Run run = run(id);
		List<Call> calls = jdbc.query("select * from billpay_lab_calls where run_id = ? order by created_at, id",
				(rs, i) -> new Call(rs.getLong("id"), rs.getString("operation"), (Integer) rs.getObject("http_status"),
						rs.getInt("duration_ms"), rs.getString("request"), rs.getString("response"), rs.getString("error"),
						rs.getTimestamp("created_at").toInstant()),
				id);
		List<Hook> hooks = new ArrayList<>();
		for (WebhookEvent e : webhooks.findForPayment(run.billpayPaymentId(), run.merchantReference())) {
			Long after = e.getReceivedAt() == null ? null : Duration.between(run.createdAt(), e.getReceivedAt()).toSeconds();
			hooks.add(new Hook(e.getEventType(), e.getStatus() == null ? null : e.getStatus().name(), e.getSignatureValid(),
					e.getSignatureScheme(), e.getError(), e.getReceivedAt(), after, e.getPayload()));
		}
		return new RunDetail(run, calls, hooks);
	}

	/** Where BillPay sends the browser back: through the https tunnel to the lab page (BillPay needs https). */
	String baseFor(String ref) {
		String redirect = app.redirectBaseUrl();
		if (redirect != null && redirect.startsWith("https://")) {
			return redirect.replaceAll("/+$", "") + "/api/billpay/lab-return?ref=" + ref;
		}
		return app.publicBaseUrl().replaceAll("/+$", "") + "/admin/billpay-lab?run=" + ref;
	}

	// ---- helpers ----

	/** Runs one BillPay call and keeps it (sent, answer, status, time), whether it works or not. */
	private <T> T record(UUID runId, String operation, String request, Supplier<T> call, java.util.function.Function<T, String> rawOf) {
		long started = System.nanoTime();
		try {
			T result = call.get();
			String raw = result == null ? null : rawOf.apply(result);
			saveCall(runId, operation, statusFrom(raw, 200), started, request, raw, null);
			return result;
		} catch (BillPayException e) {
			saveCall(runId, operation, e.isNetworkError() ? null : e.getHttpStatus(), started, request, e.getResponseBody(),
					cut(e.getMessage(), 500));
			return null;
		} catch (RuntimeException e) {
			saveCall(runId, operation, null, started, request, null, cut(e.getClass().getSimpleName() + ": " + e.getMessage(), 500));
			return null;
		}
	}

	private void saveCall(UUID runId, String operation, Integer status, long started, String request, String response,
			String error) {
		int ms = (int) ((System.nanoTime() - started) / 1_000_000);
		jdbc.update("insert into billpay_lab_calls (run_id, operation, http_status, duration_ms, request, response, error) values (?, ?, ?, ?, ?, ?, ?)",
				runId, operation, status, ms, request, response, error);
	}

	/** BillPay repeats the HTTP status inside its answer ({"statusCode": 201, ...}). */
	private static Integer statusFrom(String raw, int fallback) {
		if (raw == null) {
			return fallback;
		}
		Matcher m = STATUS_CODE.matcher(raw);
		return m.find() ? Integer.parseInt(m.group(1)) : fallback;
	}

	private Run run(UUID id) {
		List<Run> list = jdbc.query("select * from billpay_lab_runs where id = ?", (rs, i) -> mapRun(rs), id);
		if (list.isEmpty()) {
			throw ApiException.notFound("Lab payment");
		}
		return list.get(0);
	}

	private static Run mapRun(java.sql.ResultSet rs) throws java.sql.SQLException {
		Timestamp updated = rs.getTimestamp("updated_at");
		return new Run(rs.getObject("id", UUID.class), rs.getString("environment"), rs.getString("merchant_reference"),
				rs.getString("billpay_payment_id"), rs.getBigDecimal("amount"), rs.getString("description"), rs.getString("status"),
				rs.getString("checkout_url"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
				updated == null ? null : updated.toInstant());
	}

	private static String randomCode() {
		String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
		StringBuilder b = new StringBuilder();
		for (int i = 0; i < 4; i++) {
			b.append(chars.charAt(ThreadLocalRandom.current().nextInt(chars.length())));
		}
		return b.toString();
	}

	private static String blankToNull(String s, String fallback) {
		return s == null || s.isBlank() ? fallback : s.trim();
	}

	private static String cut(String s, int max) {
		return s == null || s.length() <= max ? s : s.substring(0, max);
	}
}
