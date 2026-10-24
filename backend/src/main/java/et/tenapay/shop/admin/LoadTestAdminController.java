package et.tenapay.shop.admin;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.payment.billpay.BillPayEnvironment;
import et.tenapay.shop.payment.billpay.BillPayMode;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.extern.slf4j.Slf4j;

/**
 * Admin → Load tests. Relays to the load-test runner (perf/runner, started with {@code scripts/dev.sh perf}), which
 * runs k6 against a separate copy of the shop with its own database and a fake BillPay. Starting a test is refused
 * while this shop is in live mode: load testing belongs on a test machine.
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/load-tests")
public class LoadTestAdminController {

	private final RestClient runner;
	private final String runnerUrl;
	private final BillPayMode mode;

	public LoadTestAdminController(@Value("${app.perf.runner-url:http://localhost:9930}") String runnerUrl,
			BillPayMode mode) {
		this.runnerUrl = runnerUrl;
		this.mode = mode;
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
		factory.setReadTimeout(Duration.ofSeconds(10));
		this.runner = RestClient.builder().baseUrl(runnerUrl).requestFactory(factory).build();
	}

	public record StartRequest(@NotBlank @Pattern(regexp = "^[a-z-]{2,30}$") String test, Integer vus,
			Integer duration) {
	}

	/** Runner status, available tests and the run in progress (with live numbers). */
	@GetMapping
	public ResponseEntity<String> status() {
		return relay(() -> runner.get().uri("/status").retrieve().toEntity(String.class));
	}

	@GetMapping("/runs")
	public ResponseEntity<String> runs() {
		return relay(() -> runner.get().uri("/runs").retrieve().toEntity(String.class));
	}

	@PostMapping("/runs")
	public ResponseEntity<String> start(@Valid @RequestBody StartRequest req) {
		if (mode.current() == BillPayEnvironment.LIVE) {
			throw new ApiException(HttpStatus.CONFLICT, "LIVE_MODE",
					"Load tests are switched off while the shop takes real payments. Run them on a test machine.");
		}
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("test", req.test());
		body.put("vus", req.vus());
		body.put("duration", req.duration());
		body.put("startedBy", CurrentUser.get().map(CurrentUser::email).orElse("admin"));
		log.info("Load test '{}' started by {} (vus={}, duration={}s)", req.test(), body.get("startedBy"), req.vus(),
				req.duration());
		return relay(() -> runner.post().uri("/runs").contentType(MediaType.APPLICATION_JSON).body(body)
				.retrieve().onStatus(s -> true, (rq, rs) -> {
				}).toEntity(String.class));
	}

	@PostMapping("/stop")
	public ResponseEntity<String> stop() {
		return relay(() -> runner.post().uri("/runs/current/stop").retrieve().onStatus(s -> true, (rq, rs) -> {
		}).toEntity(String.class));
	}

	/** k6's HTML report for a finished run. */
	@GetMapping("/runs/{id}/report")
	public ResponseEntity<byte[]> report(@PathVariable @Pattern(regexp = "^[\\w-]{5,80}$") String id) {
		if (!id.matches("^[\\w-]{5,80}$")) {
			throw ApiException.notFound("Report");
		}
		try {
			ResponseEntity<byte[]> r = runner.get().uri("/runs/{id}/report", id).retrieve()
					.onStatus(s -> true, (rq, rs) -> {
					}).toEntity(byte[].class);
			if (!r.getStatusCode().is2xxSuccessful()) {
				throw ApiException.notFound("Report");
			}
			return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(r.getBody());
		} catch (org.springframework.web.client.ResourceAccessException e) {
			throw unavailable();
		}
	}

	private ResponseEntity<String> relay(java.util.function.Supplier<ResponseEntity<String>> call) {
		try {
			ResponseEntity<String> r = call.get();
			return ResponseEntity.status(r.getStatusCode()).contentType(MediaType.APPLICATION_JSON).body(r.getBody());
		} catch (org.springframework.web.client.ResourceAccessException e) {
			throw unavailable();
		}
	}

	private ApiException unavailable() {
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "RUNNER_DOWN",
				"The load-test environment isn't running. Start it with: scripts/dev.sh perf",
				Map.of("runnerUrl", runnerUrl));
	}
}
