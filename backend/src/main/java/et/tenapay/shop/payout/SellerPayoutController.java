package et.tenapay.shop.payout;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.order.Order;
import et.tenapay.shop.order.OrderParcel;
import et.tenapay.shop.order.OrderParcelRepository;
import et.tenapay.shop.order.OrderRepository;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopService;
import et.tenapay.shop.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** The seller's money (design S17/S20): balance, payout account, payout requests and a statement per parcel. */
@RestController
@RequestMapping("/api/seller/money")
@RequiredArgsConstructor
public class SellerPayoutController {

	private final ShopService shopService;
	private final PayoutService service;
	private final PayoutRepository payouts;
	private final OrderParcelRepository parcels;
	private final OrderRepository orders;

	public record Account(String method, String provider, String accountName, String account) {

		static Account of(Shop s) {
			return s.getPayoutMethod() == null ? null
					: new Account(s.getPayoutMethod(), s.getPayoutProvider(), s.getPayoutAccountName(), s.getPayoutAccount());
		}
	}

	public record PayoutView(Long id, BigDecimal amount, String status, String method, String provider, String account,
			String reference, String note, Instant requestedAt, Instant decidedAt) {

		static PayoutView of(Payout p) {
			return new PayoutView(p.getId(), p.getAmount(), p.getStatus().name(), p.getMethod(), p.getProvider(),
					mask(p.getAccount()), p.getReference(), p.getNote(), p.getRequestedAt(), p.getDecidedAt());
		}
	}

	public record Money(PayoutService.Balance balance, Account account, long releaseAfterHours,
			java.util.List<PayoutView> recentPayouts) {
	}

	/** One parcel on the statement: what the buyer paid for it, the fee, and what the seller gets. */
	public record StatementLine(String parcelNumber, Instant paidAt, BigDecimal itemsTotal, BigDecimal deliveryFee,
			BigDecimal commissionPercent, BigDecimal commission, BigDecimal sellerAmount, String fulfilmentStatus,
			String payoutStatus, Instant releasedAt) {
	}

	public record AccountRequest(@NotNull @Size(max = 20) String method, @Size(max = 80) String provider,
			@NotNull @Size(max = 120) String accountName, @NotNull @Size(max = 40) String account) {
	}

	public record PayoutRequest(@NotNull @DecimalMin("1") @Digits(integer = 10, fraction = 2) BigDecimal amount) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public Money money() {
		Shop shop = shopService.requireMine();
		return new Money(service.balance(shop.getId()), Account.of(shop), service.releaseAfter().toHours(),
				payouts.findByShopIdOrderByRequestedAtDesc(shop.getId(), PageRequest.of(0, 10)).map(PayoutView::of).getContent());
	}

	@PutMapping("/account")
	public Account account(@Valid @RequestBody AccountRequest req) {
		Shop shop = shopService.requireMine();
		return Account.of(service.saveAccount(shop.getId(),
				new PayoutService.AccountForm(req.method(), req.provider(), req.accountName(), req.account())));
	}

	@PostMapping("/payouts")
	public PayoutView request(@Valid @RequestBody PayoutRequest req) {
		Shop shop = shopService.requireMine();
		String by = CurrentUser.get().map(u -> u.email() != null ? u.email() : u.id().toString()).orElse("seller");
		return PayoutView.of(service.request(shop.getId(), req.amount(), by));
	}

	@GetMapping("/payouts")
	@Transactional(readOnly = true)
	public PageDto<PayoutView> payouts(@RequestParam(defaultValue = "0") int page) {
		Shop shop = shopService.requireMine();
		return PageDto.of(payouts.findByShopIdOrderByRequestedAtDesc(shop.getId(), PageRequest.of(page, 20)).map(PayoutView::of));
	}

	@GetMapping("/statement")
	@Transactional(readOnly = true)
	public PageDto<StatementLine> statement(@RequestParam(defaultValue = "0") int page) {
		Shop shop = shopService.requireMine();
		var result = parcels.findByShopIdAndPayoutStatusIsNotNull(shop.getId(), PageRequest.of(page, 30, Sort.by("id").descending()));
		Map<UUID, Order> byId = new HashMap<>();
		orders.findAllById(result.getContent().stream().map(OrderParcel::getOrderId).toList()).forEach(o -> byId.put(o.getId(), o));
		return PageDto.of(result.map(p -> {
			Order o = byId.get(p.getOrderId());
			return new StatementLine(p.number(o.getOrderNumber()), o.getPaidAt(), p.getItemsTotal(), p.getDeliveryFee(),
					p.getCommissionPercent(), p.getCommissionAmount(), p.getSellerAmount(),
					p.getFulfilmentStatus() == null ? null : p.getFulfilmentStatus().name(), p.getPayoutStatus().name(),
					p.getReleasedAt());
		}));
	}

	/** "1000123456789" → "•••• 6789" */
	static String mask(String account) {
		if (account == null || account.length() <= 4) {
			return account;
		}
		return "•••• " + account.substring(account.length() - 4);
	}
}
