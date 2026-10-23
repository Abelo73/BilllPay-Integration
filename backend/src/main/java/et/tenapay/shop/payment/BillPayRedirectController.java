package et.tenapay.shop.payment;

import java.net.URI;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.config.AppProperties;
import lombok.RequiredArgsConstructor;

/**
 * BillPay only accepts https return/cancel URLs. When the shop runs on http://localhost, BillPay sends the shopper
 * here (through the https tunnel) and we forward the browser to the shop. Nothing here marks an order paid: the return
 * page asks the backend for the real status.
 */
@RestController
@RequiredArgsConstructor
public class BillPayRedirectController {

	private static final Pattern ORDER_NUMBER = Pattern.compile("^TS-\\d{8}-\\d{5}$");

	private final AppProperties app;

	@GetMapping("/api/billpay/return")
	public ResponseEntity<Void> returned(@RequestParam(required = false) String order) {
		return redirect("/checkout/return", order);
	}

	@GetMapping("/api/billpay/cancel")
	public ResponseEntity<Void> cancelled(@RequestParam(required = false) String order) {
		return redirect("/checkout/cancelled", order);
	}

	private ResponseEntity<Void> redirect(String path, String order) {
		// Only our own order-number format is passed on, so this can't be used as an open redirect.
		String target = order != null && ORDER_NUMBER.matcher(order).matches()
				? app.publicBaseUrl() + path + "?order=" + order
				: app.publicBaseUrl() + "/orders/track";
		return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
	}
}
