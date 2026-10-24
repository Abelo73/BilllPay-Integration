package et.tenapay.shop.admin;

import java.io.IOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * Admin reports: sales, top products, payment success by method, failure reasons, and CSV exports of orders and
 * payments for matching against BillPay's settlement reports. Days are counted in Addis Ababa time.
 */
@RestController
@RequestMapping("/api/admin/reports")
@RequiredArgsConstructor
public class ReportsController {

	private static final ZoneId ADDIS = ZoneId.of("Africa/Addis_Ababa");
	private static final String FINAL = "'SUCCEEDED','FAILED','EXPIRED','CANCELLED'";

	private final JdbcTemplate jdbc;

	public record Totals(BigDecimal revenue, long paidOrders, long orders, BigDecimal averageOrder,
			BigDecimal paymentSuccessRate, BigDecimal refunded) {
	}

	public record Day(String day, long orders, long paidOrders, BigDecimal revenue) {
	}

	public record TopProduct(long productId, String name, long quantity, BigDecimal revenue) {
	}

	public record MethodRow(String method, long finished, long succeeded, BigDecimal successRate) {
	}

	public record ReasonRow(String reason, long count) {
	}

	public record Report(LocalDate from, LocalDate to, Totals totals, List<Day> salesByDay, List<TopProduct> topProducts,
			List<MethodRow> byMethod, List<ReasonRow> failureReasons) {
	}

	@GetMapping
	public Report report(@RequestParam(defaultValue = "30") int days) {
		int range = Math.max(1, Math.min(days, 366));
		LocalDate to = LocalDate.now(ADDIS);
		LocalDate from = to.minusDays(range - 1L);
		Timestamp since = Timestamp.from(from.atStartOfDay(ADDIS).toInstant());

		Map<String, Day> byDay = new LinkedHashMap<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			byDay.put(d.toString(), new Day(d.toString(), 0, 0, BigDecimal.ZERO));
		}
		jdbc.query("""
				select to_char((created_at at time zone 'Africa/Addis_Ababa')::date, 'YYYY-MM-DD') as day,
				       count(*) as orders,
				       count(*) filter (where paid_at is not null) as paid,
				       coalesce(sum(total) filter (where paid_at is not null), 0) as revenue
				from orders where created_at >= ? group by 1
				""", rs -> {
			byDay.put(rs.getString("day"), new Day(rs.getString("day"), rs.getLong("orders"), rs.getLong("paid"),
					rs.getBigDecimal("revenue")));
		}, since);
		List<Day> days2 = new ArrayList<>(byDay.values());

		List<TopProduct> top = jdbc.query("""
				select i.product_id, max(i.product_name) as name, sum(i.quantity) as qty, sum(i.line_total) as revenue
				from order_items i join orders o on o.id = i.order_id
				where o.paid_at is not null and o.created_at >= ?
				group by i.product_id order by revenue desc, qty desc limit 10
				""", (rs, n) -> new TopProduct(rs.getLong("product_id"), rs.getString("name"), rs.getLong("qty"),
				rs.getBigDecimal("revenue")), since);

		List<MethodRow> methods = jdbc.query("""
				select coalesce(payment_method, 'NOT_CHOSEN') as method,
				       count(*) filter (where status in (%s)) as finished,
				       count(*) filter (where status = 'SUCCEEDED') as ok
				from payment_attempts where created_at >= ?
				group by 1 order by ok desc, finished desc
				""".formatted(FINAL), (rs, n) -> new MethodRow(rs.getString("method"), rs.getLong("finished"),
				rs.getLong("ok"), rate(rs.getLong("ok"), rs.getLong("finished"))), since);

		List<ReasonRow> reasons = jdbc.query("""
				select reason_code, count(*) as n from payment_attempts
				where reason_code is not null and created_at >= ?
				group by 1 order by n desc
				""", (rs, n) -> new ReasonRow(rs.getString("reason_code"), rs.getLong("n")), since);

		long orders = days2.stream().mapToLong(Day::orders).sum();
		long paid = days2.stream().mapToLong(Day::paidOrders).sum();
		BigDecimal revenue = days2.stream().map(Day::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
		long finished = methods.stream().mapToLong(MethodRow::finished).sum();
		long succeeded = methods.stream().mapToLong(MethodRow::succeeded).sum();
		BigDecimal refunded = jdbc.queryForObject(
				"select coalesce(sum(amount), 0) from refunds where status = 'SUCCEEDED' and created_at >= ?",
				BigDecimal.class, since);
		Totals totals = new Totals(revenue, paid, orders,
				paid == 0 ? BigDecimal.ZERO : revenue.divide(BigDecimal.valueOf(paid), 2, RoundingMode.HALF_UP),
				rate(succeeded, finished), refunded);
		return new Report(from, to, totals, days2, top, methods, reasons);
	}

	/** Orders with their (successful or latest) BillPay payment, one row per order. */
	@GetMapping("/orders.csv")
	public void ordersCsv(@RequestParam(defaultValue = "30") int days, HttpServletResponse response) throws IOException {
		csv(response, "orders", days, """
				select o.order_number, o.created_at, o.status, o.fulfilment_status, o.customer_name, o.customer_phone,
				       o.customer_email, o.delivery_city, o.subtotal, o.delivery_fee, o.total, o.currency, o.paid_at,
				       a.payment_method, a.merchant_reference, a.billpay_payment_id
				from orders o
				left join lateral (
				    select * from payment_attempts pa where pa.order_id = o.id
				    order by (pa.status = 'SUCCEEDED') desc, pa.attempt_no desc limit 1) a on true
				where o.created_at >= ? order by o.created_at
				""");
	}

	/** Every payment attempt: what to match against BillPay's settlement / transaction export. */
	@GetMapping("/payments.csv")
	public void paymentsCsv(@RequestParam(defaultValue = "30") int days, HttpServletResponse response) throws IOException {
		csv(response, "payments", days, """
				select pa.merchant_reference, o.order_number, pa.billpay_payment_id, pa.attempt_no, pa.status,
				       pa.amount, pa.currency, pa.payment_method, pa.reason_code, pa.created_at, pa.updated_at,
				       (select coalesce(sum(r.amount), 0) from refunds r
				        where r.payment_attempt_id = pa.id and r.status = 'SUCCEEDED') as refunded
				from payment_attempts pa join orders o on o.id = pa.order_id
				where pa.created_at >= ? order by pa.created_at
				""");
	}

	private void csv(HttpServletResponse response, String name, int days, String sql) throws IOException {
		int range = Math.max(1, Math.min(days, 366));
		LocalDate to = LocalDate.now(ADDIS);
		Timestamp since = Timestamp.from(to.minusDays(range - 1L).atStartOfDay(ADDIS).toInstant());
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"tenashop-" + name + "-"
				+ to.format(DateTimeFormatter.BASIC_ISO_DATE) + ".csv\"");
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		Writer out = response.getWriter();
		out.write('﻿'); // lets Excel detect UTF-8
		boolean[] header = { true };
		jdbc.query(sql, rs -> {
			try {
				if (header[0]) {
					ResultSetMetaData md = rs.getMetaData();
					List<String> names = new ArrayList<>();
					for (int i = 1; i <= md.getColumnCount(); i++) {
						names.add(md.getColumnLabel(i));
					}
					out.write(String.join(",", names) + "\r\n");
					header[0] = false;
				}
				out.write(row(rs) + "\r\n");
			} catch (IOException e) {
				throw new SQLException(e);
			}
		}, since);
		out.flush();
	}

	private static String row(ResultSet rs) throws SQLException {
		ResultSetMetaData md = rs.getMetaData();
		List<String> cells = new ArrayList<>();
		for (int i = 1; i <= md.getColumnCount(); i++) {
			Object v = rs.getObject(i);
			if (v instanceof Timestamp t) {
				cells.add(cell(DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(t.toInstant().atZone(ADDIS))));
			} else if (v instanceof Number || v == null) {
				cells.add(v == null ? "" : v.toString());
			} else {
				cells.add(cell(v.toString()));
			}
		}
		return String.join(",", cells);
	}

	/**
	 * Quotes a text cell; a leading = + - @ is neutralised so spreadsheets don't run it as a formula (plain phone
	 * numbers like +251911223344 are left as they are).
	 */
	static String cell(String s) {
		String v = s;
		if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0 && !v.matches("\\+[0-9 ]{6,20}")) {
			v = "'" + v;
		}
		return "\"" + v.replace("\"", "\"\"") + "\"";
	}

	private static BigDecimal rate(long part, long whole) {
		return whole == 0 ? BigDecimal.ZERO
				: BigDecimal.valueOf(part).divide(BigDecimal.valueOf(whole), 4, RoundingMode.HALF_UP);
	}

}
