package et.tenapay.shop.refund;

import java.time.Instant;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Sends waiting refunds again when their wait is over, and flags refunds stuck in review at BillPay. */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefundRetryJob {

	private final RefundService refunds;

	@Scheduled(fixedDelayString = "PT2M", initialDelayString = "PT1M")
	public void run() {
		run(Instant.now());
	}

	public Result run(Instant now) {
		int sent = 0;
		int stuck = 0;
		try {
			sent = refunds.sendDue(now, 50);
		} catch (RuntimeException e) {
			log.warn("Refund retries failed: {}", e.getMessage());
		}
		try {
			stuck = refunds.flagStuck(now);
		} catch (RuntimeException e) {
			log.warn("Stuck refund check failed: {}", e.getMessage());
		}
		if (sent > 0 || stuck > 0) {
			log.info("Refund job: {} sent again, {} flagged as stuck in review", sent, stuck);
		}
		return new Result(sent, stuck);
	}

	public record Result(int sentAgain, int flaggedStuck) {
	}
}
