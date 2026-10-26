package et.tenapay.shop.config;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * M23: per-visitor request limits on /api, per minute: sign-in and sign-up calls, other changes (POST/PUT/PATCH/DELETE),
 * and reads. Over the limit the answer is 429 with Retry-After. BillPay webhooks are never limited.
 *
 * The visitor is the first X-Forwarded-For address when the request came through our own proxy (ngrok, nginx), else
 * the connecting address. Requests straight from this machine or the private network with no proxy header (the Vite
 * dev proxy, tests, the load-test runner, Prometheus) are not limited.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

	private final boolean enabled;
	private final int authPerMinute;
	private final int writesPerMinute;
	private final int readsPerMinute;

	private final Map<String, Window> windows = new ConcurrentHashMap<>();

	public RateLimitFilter(@Value("${app.rate-limit.enabled:true}") boolean enabled,
			@Value("${app.rate-limit.auth-per-minute:20}") int authPerMinute,
			@Value("${app.rate-limit.writes-per-minute:120}") int writesPerMinute,
			@Value("${app.rate-limit.reads-per-minute:600}") int readsPerMinute) {
		this.enabled = enabled;
		this.authPerMinute = authPerMinute;
		this.writesPerMinute = writesPerMinute;
		this.readsPerMinute = readsPerMinute;
	}

	private record Window(long minute, AtomicInteger count) {
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		return !enabled || !path.startsWith("/api/") || path.startsWith("/api/webhooks/") || "OPTIONS".equals(request.getMethod());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String client = clientOf(request);
		if (client == null) {
			chain.doFilter(request, response);
			return;
		}
		String bucket = bucketOf(request);
		int limit = switch (bucket) {
			case "auth" -> authPerMinute;
			case "write" -> writesPerMinute;
			default -> readsPerMinute;
		};
		long minute = System.currentTimeMillis() / 60_000;
		Window w = windows.compute(bucket + "|" + client,
				(k, old) -> old == null || old.minute() != minute ? new Window(minute, new AtomicInteger()) : old);
		if (w.count().incrementAndGet() > limit) {
			long retry = 60 - (System.currentTimeMillis() / 1000) % 60;
			if (w.count().get() == limit + 1) {
				log.warn("Rate limit: {} over {} {}/min on {}", client, bucket, limit, request.getRequestURI());
			}
			response.setStatus(429);
			response.setHeader("Retry-After", String.valueOf(retry));
			response.setContentType("application/problem+json");
			response.getWriter().write("{\"status\":429,\"code\":\"RATE_LIMITED\",\"detail\":\"Too many requests. Please wait "
					+ retry + " seconds and try again.\"}");
			return;
		}
		if (windows.size() > 50_000) {
			windows.entrySet().removeIf(e -> e.getValue().minute() != minute);
		}
		chain.doFilter(request, response);
	}

	static String bucketOf(HttpServletRequest r) {
		String path = r.getRequestURI();
		if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/auth/")) {
			return "POST".equals(r.getMethod()) ? "auth" : "read";
		}
		return switch (r.getMethod()) {
			case "POST", "PUT", "PATCH", "DELETE" -> "write";
			default -> "read";
		};
	}

	/** The visitor's address, or null when the request comes straight from inside (not limited). */
	static String clientOf(HttpServletRequest r) {
		String forwarded = r.getHeader("X-Forwarded-For");
		boolean fromInside = internal(r.getRemoteAddr());
		if (forwarded != null && !forwarded.isBlank() && fromInside) {
			return forwarded.split(",")[0].trim();
		}
		return fromInside ? null : r.getRemoteAddr();
	}

	private static boolean internal(String addr) {
		try {
			InetAddress ip = InetAddress.getByName(addr);
			return ip.isLoopbackAddress() || ip.isSiteLocalAddress() || ip.isLinkLocalAddress();
		} catch (UnknownHostException e) {
			return false;
		}
	}
}
