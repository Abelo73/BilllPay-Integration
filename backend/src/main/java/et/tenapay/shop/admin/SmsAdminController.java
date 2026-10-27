package et.tenapay.shop.admin;

import java.time.Instant;

import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.sms.SmsMessage;
import et.tenapay.shop.sms.SmsMessageRepository;
import et.tenapay.shop.sms.SmsService;
import lombok.RequiredArgsConstructor;

/** Admin: every text message the shop sent, and whether SMS really reaches phones. */
@RestController
@RequestMapping("/api/admin/sms")
@RequiredArgsConstructor
public class SmsAdminController {

	private final SmsMessageRepository messages;
	private final SmsService sms;

	public record SmsRow(Long id, String kind, String recipient, String body, String provider, String status,
			String error, String orderNumber, Instant createdAt) {

		static SmsRow of(SmsMessage m) {
			return new SmsRow(m.getId(), m.getKind(), m.getRecipient(), m.getBody(), m.getProvider(), m.getStatus().name(),
					m.getError(), m.getOrderNumber(), m.getCreatedAt());
		}
	}

	/** {@code delivering}: false means test mode (no AfroMessage token): messages are only logged. */
	/** {@code switchedOff}: AfroMessage is set up but staff turned real sending off (Admin → Features). */
	public record SmsSetup(String provider, boolean delivering, String sender, boolean identifierSet, boolean switchedOff) {
	}

	public record SmsView(SmsSetup setup, PageDto<SmsRow> page) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public SmsView list(@RequestParam(required = false) String status, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		SmsMessage.Status st = status == null || status.isBlank() ? null : SmsMessage.Status.valueOf(status);
		var afro = sms.properties().afromessage();
		SmsSetup setup = new SmsSetup(sms.providerName(), sms.delivers(), afro == null ? null : blankToNull(afro.sender()),
				afro != null && blankToNull(afro.identifierId()) != null, sms.switchedOff());
		return new SmsView(setup, PageDto.of(messages.search(st, q == null || q.isBlank() ? null : q.trim(),
				PageRequest.of(page, Math.min(size, 100))).map(SmsRow::of)));
	}

	private static String blankToNull(String s) {
		return s == null || s.isBlank() ? null : s;
	}
}
