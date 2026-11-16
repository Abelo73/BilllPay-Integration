package et.tenapay.shop.seller;

import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * The shop's social links: Instagram, Facebook and Telegram handles. Only the handle is stored; the link is built
 * from it on the page. Nothing is imported from those sites, and a web address is refused, so the link always goes
 * where we say.
 */
@RestController
@RequiredArgsConstructor
public class ShopSocialController {

	private static final Pattern INSTAGRAM = Pattern.compile("^[A-Za-z0-9._]{1,30}$");
	private static final Pattern FACEBOOK = Pattern.compile("^[A-Za-z0-9 .\\-]{3,60}$");
	private static final Pattern TELEGRAM = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{4,31}$");

	private final ShopService shopService;

	public record Socials(String instagram, String facebook, String telegram) {
	}

	public record SocialsRequest(@Size(max = 60) String instagram, @Size(max = 80) String facebook, @Size(max = 40) String telegram) {
	}

	@GetMapping("/api/seller/shop/social")
	public Socials mine() {
		Shop s = shopService.requireMine();
		return new Socials(s.getInstagram(), s.getFacebook(), s.getTelegram());
	}

	@PutMapping("/api/seller/shop/social")
	@Transactional
	public Socials save(@Valid @RequestBody SocialsRequest req) {
		Shop s = shopService.requireMine();
		s.setInstagram(handle(req.instagram(), INSTAGRAM, "Instagram"));
		s.setFacebook(handle(req.facebook(), FACEBOOK, "Facebook"));
		s.setTelegram(handle(req.telegram(), TELEGRAM, "Telegram"));
		return new Socials(s.getInstagram(), s.getFacebook(), s.getTelegram());
	}

	/** A handle, with a leading @ removed. Blank means "none". A web address or a path is refused. */
	static String handle(String raw, Pattern allowed, String platform) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String h = raw.trim();
		if (h.startsWith("@")) {
			h = h.substring(1);
		}
		// Facebook page names may have spaces; the other two never do
		if (h.contains("/") || h.contains(":") || (h.contains(" ") && !platform.equals("Facebook"))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "HANDLE_INVALID",
					platform + ": type only the name, for example @marta_boutique. Do not paste a web address.");
		}
		if (!allowed.matcher(h).matches()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "HANDLE_INVALID", platform + ": that name is not valid.");
		}
		return h;
	}
}
