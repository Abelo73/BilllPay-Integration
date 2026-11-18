package et.tenapay.shop.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** M23: too many sign-in tries from one visitor (behind our proxy) get 429; others and internal calls are not limited. */
class RateLimitIntegrationTest extends IntegrationTest {

	private static final String BODY = "{\"email\":\"nobody@it.test\",\"password\":\"Wrong-pass-2026\"}";

	@Test
	void signInTriesAreLimitedPerVisitor() {
		// The limit counts per minute. If a minute ends part way through, the count starts again, so keep going
		// until the limit shows (within two minutes), and check that at least 20 tries went through before it did.
		List<Integer> statuses = new ArrayList<>();
		long until = System.currentTimeMillis() + 130_000;
		while (System.currentTimeMillis() < until) {
			int status = postRaw("/api/auth/login", BODY, Map.of("X-Forwarded-For", "203.0.113.9")).status();
			statuses.add(status);
			if (status == 429) {
				break;
			}
		}
		assertThat(statuses).contains(429);
		int firstLimited = statuses.indexOf(429);
		assertThat(firstLimited).isGreaterThanOrEqualTo(20);
		assertThat(statuses.subList(0, firstLimited)).doesNotContain(429);
		Res limited = postRaw("/api/auth/login", BODY, Map.of("X-Forwarded-For", "203.0.113.9"));
		assertThat(limited.text("code")).isEqualTo("RATE_LIMITED");

		// another visitor, and requests straight from inside (no proxy header), go through
		assertThat(postRaw("/api/auth/login", BODY, Map.of("X-Forwarded-For", "198.51.100.7")).status()).isEqualTo(401);
		assertThat(postRaw("/api/auth/login", BODY, Map.of()).status()).isEqualTo(401);
		// reading the store isn't the sign-in bucket
		assertThat(get("/api/categories").status()).isEqualTo(200);
	}
}
