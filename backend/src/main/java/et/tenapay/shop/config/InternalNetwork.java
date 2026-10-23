package et.tenapay.shop.config;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.function.Supplier;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Allows a request only when it comes straight from this machine or a private network (e.g. Prometheus in Docker),
 * not through a proxy. ngrok and the nginx frontend both add X-Forwarded-For, so metrics never leak through them.
 */
final class InternalNetwork {

	private InternalNetwork() {
	}

	static AuthorizationDecision check(Supplier<? extends Authentication> auth, RequestAuthorizationContext ctx) {
		return new AuthorizationDecision(isInternal(ctx.getRequest()));
	}

	static boolean isInternal(HttpServletRequest request) {
		if (request.getHeader("X-Forwarded-For") != null || request.getHeader("Forwarded") != null) {
			return false;
		}
		try {
			InetAddress ip = InetAddress.getByName(request.getRemoteAddr());
			return ip.isLoopbackAddress() || ip.isSiteLocalAddress() || ip.isLinkLocalAddress();
		} catch (UnknownHostException e) {
			return false;
		}
	}
}
