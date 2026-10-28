package et.tenapay.shop.billpaylab;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.config.AppProperties;
import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin → BillPay lab. Reading is open to support staff; making payments and refunds is admin-only (security config). */
@RestController
@RequiredArgsConstructor
public class BillPayLabController {

	private final BillPayLabService lab;
	private final BillPayScenarioService scenarios;
	private final AppProperties app;

	public record CreateRequest(@NotNull BillPayEnvironment environment, @NotNull BigDecimal amount,
			@Size(max = 200) String description, @Size(max = 120) String customerName, @Size(max = 20) String customerPhone,
			/** Required (true) for LIVE; may be left out for SANDBOX */
			Boolean confirmLive) {
	}

	public record RefundRequest(BigDecimal amount, @Size(max = 200) String reason) {
	}

	@GetMapping("/api/admin/billpay-lab")
	public List<BillPayLabService.Run> list() {
		return lab.recent();
	}

	/** Call counts and timings per environment and operation, and how lab payments ended. */
	@GetMapping("/api/admin/billpay-lab/stats")
	public BillPayLabService.Stats stats() {
		return lab.stats();
	}

	/** Does BillPay accept our sandbox and live API keys? Creates nothing (admin only, like every lab POST). */
	@PostMapping("/api/admin/billpay-lab/key-check")
	public List<BillPayLabService.KeyCheck> keyCheck() {
		return lab.checkKeys();
	}

	/** The latest scenario run: one sandbox payment per BillPay test case, each passed, failed or waiting. */
	@GetMapping("/api/admin/billpay-lab/scenarios")
	public BillPayScenarioService.Board scenarios() {
		return scenarios.board();
	}

	@PostMapping("/api/admin/billpay-lab/scenarios")
	public BillPayScenarioService.Board startScenarios() {
		return scenarios.start(CurrentUser.get().map(CurrentUser::email).orElse(null));
	}

	/** Asks BillPay about every scenario payment still waiting. */
	@PostMapping("/api/admin/billpay-lab/scenarios/check")
	public BillPayScenarioService.Board checkScenarios() {
		return scenarios.check();
	}

	/** After "Paid" passed: a refund BillPay should accept and one it should refuse (.13). */
	@PostMapping("/api/admin/billpay-lab/scenarios/refunds")
	public BillPayScenarioService.Board scenarioRefunds() {
		return scenarios.refunds();
	}

	@GetMapping("/api/admin/billpay-lab/{id}")
	public BillPayLabService.RunDetail detail(@PathVariable UUID id) {
		return lab.detail(id);
	}

	@PostMapping("/api/admin/billpay-lab")
	public BillPayLabService.RunDetail create(@Valid @RequestBody CreateRequest req) {
		return lab.create(req.environment(), req.amount(), req.description(), req.customerName(), req.customerPhone(),
				Boolean.TRUE.equals(req.confirmLive()), CurrentUser.get().map(CurrentUser::email).orElse(null));
	}

	@PostMapping("/api/admin/billpay-lab/{id}/refresh")
	public BillPayLabService.RunDetail refresh(@PathVariable UUID id) {
		return lab.refresh(id);
	}

	@PostMapping("/api/admin/billpay-lab/{id}/refund")
	public BillPayLabService.RunDetail refund(@PathVariable UUID id, @Valid @RequestBody RefundRequest req) {
		return lab.refund(id, req.amount(), req.reason());
	}

	/** BillPay sends the browser here (https, through the tunnel) after a lab payment; we forward to the lab page. */
	@GetMapping("/api/billpay/lab-return")
	public ResponseEntity<Void> returned(@RequestParam(required = false) String ref) {
		// only our own reference format is passed on, so this can't be used as an open redirect
		String target = app.publicBaseUrl().replaceAll("/+$", "") + "/admin/billpay-lab"
				+ (ref != null && BillPayLabService.REFERENCE.matcher(ref).matches() ? "?run=" + ref : "");
		return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
	}
}
