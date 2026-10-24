package et.tenapay.shop.admin;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.common.PageDto;
import et.tenapay.shop.media.MediaProperties;
import et.tenapay.shop.seller.Shop;
import et.tenapay.shop.seller.ShopRepository;
import et.tenapay.shop.seller.ShopService;
import et.tenapay.shop.seller.ShopStatus;
import et.tenapay.shop.seller.ShopViews.ShopDto;
import et.tenapay.shop.user.CurrentUser;
import et.tenapay.shop.user.User;
import et.tenapay.shop.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Sellers for staff: the approval queue and approve / reject / suspend. GET is open to Support (SecurityConfig). */
@RestController
@RequestMapping("/api/admin/shops")
@RequiredArgsConstructor
public class ShopAdminController {

	private final ShopRepository shops;
	private final ShopService shopService;
	private final UserRepository users;
	private final MediaProperties media;

	public record Owner(String fullName, String phone, String email) {
	}

	public record ShopRow(ShopDto shop, Owner owner, long products, long productsInStore, String decidedBy) {
	}

	public record ShopList(Map<String, Long> counts, PageDto<ShopRow> page) {
	}

	public record DecisionRequest(@NotNull ShopStatus status, @Size(max = 500) String note) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public ShopList list(@RequestParam(required = false) ShopStatus status, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "0") int page) {
		// oldest first while waiting for a decision, so nobody waits forever; newest first otherwise
		Sort sort = status == ShopStatus.PENDING ? Sort.by("createdAt").ascending() : Sort.by("createdAt").descending();
		Page<Shop> result = shops.adminSearch(status, q == null || q.isBlank() ? null : q.trim(),
				PageRequest.of(page, 20, sort));
		Map<String, Long> counts = new LinkedHashMap<>();
		for (ShopStatus s : ShopStatus.values()) {
			counts.put(s.name(), shops.countByStatus(s));
		}
		return new ShopList(counts, PageDto.of(rows(result)));
	}

	@GetMapping("/{id}")
	@Transactional(readOnly = true)
	public ShopRow get(@PathVariable Long id) {
		Shop shop = shops.findById(id).orElseThrow(() -> ApiException.notFound("Shop"));
		return rows(new org.springframework.data.domain.PageImpl<>(List.of(shop))).getContent().get(0);
	}

	@PostMapping("/{id}/decision")
	public ShopRow decide(@PathVariable Long id, @Valid @RequestBody DecisionRequest req) {
		String by = CurrentUser.get().map(CurrentUser::email).orElse("staff");
		shopService.decide(id, req.status(), req.note(), by);
		return get(id);
	}

	private Page<ShopRow> rows(Page<Shop> page) {
		List<Long> ids = page.getContent().stream().map(Shop::getId).toList();
		Map<Long, long[]> counts = new HashMap<>();
		if (!ids.isEmpty()) {
			for (Object[] r : shops.productCounts(ids)) {
				counts.put((Long) r[0], new long[] { ((Number) r[1]).longValue(), r[2] == null ? 0 : ((Number) r[2]).longValue() });
			}
		}
		List<UUID> ownerIds = page.getContent().stream().map(Shop::getOwnerId).toList();
		Map<UUID, User> owners = users.findAllById(ownerIds).stream().collect(Collectors.toMap(User::getId, Function.identity()));
		return page.map(s -> {
			User u = owners.get(s.getOwnerId());
			long[] n = counts.getOrDefault(s.getId(), new long[] { 0, 0 });
			return new ShopRow(ShopDto.of(s, media),
					u == null ? null : new Owner(u.getFullName(), u.getPhone(), u.getEmail()), n[0], n[1], s.getDecidedBy());
		});
	}
}
