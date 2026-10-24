package et.tenapay.shop.admin;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.Area;
import et.tenapay.shop.catalog.AreaRepository;
import et.tenapay.shop.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Areas of Sodo offered to sellers and shoppers (Admin → Areas). GET for Support, changes for ADMIN. */
@RestController
@RequestMapping("/api/admin/areas")
@RequiredArgsConstructor
public class AreaAdminController {

	private final AreaRepository areas;

	public record AreaRow(Long id, String name, int sortOrder, boolean active) {
	}

	public record AreaRequest(@Size(max = 120) String name, Boolean active) {
	}

	public record OrderRequest(@NotNull List<Long> ids) {
	}

	@GetMapping
	@Transactional(readOnly = true)
	public List<AreaRow> list() {
		return areas.findAllByOrderBySortOrderAscIdAsc().stream()
				.map(a -> new AreaRow(a.getId(), a.getName(), a.getSortOrder(), a.isActive())).toList();
	}

	@PostMapping
	@Transactional
	public List<AreaRow> create(@Valid @RequestBody AreaRequest req) {
		String name = req.name() == null ? "" : req.name().trim();
		if (name.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "Enter the area's name.");
		}
		if (areas.existsByNameIgnoreCase(name)) {
			throw new ApiException(HttpStatus.CONFLICT, "AREA_EXISTS", "That area is already in the list.");
		}
		Area a = new Area();
		a.setName(name);
		a.setSortOrder(areas.maxSortOrder() + 1);
		areas.save(a);
		return list();
	}

	@PatchMapping("/{id}")
	@Transactional
	public List<AreaRow> update(@PathVariable Long id, @Valid @RequestBody AreaRequest req) {
		Area a = areas.findById(id).orElseThrow(() -> ApiException.notFound("Area"));
		if (req.name() != null && !req.name().isBlank() && !req.name().trim().equalsIgnoreCase(a.getName())) {
			if (areas.existsByNameIgnoreCase(req.name().trim())) {
				throw new ApiException(HttpStatus.CONFLICT, "AREA_EXISTS", "That area is already in the list.");
			}
			a.setName(req.name().trim());
		}
		if (req.active() != null) {
			a.setActive(req.active());
		}
		return list();
	}

	@PutMapping("/order")
	@Transactional
	public List<AreaRow> reorder(@Valid @RequestBody OrderRequest req) {
		List<Area> all = areas.findAllByOrderBySortOrderAscIdAsc();
		if (req.ids().size() != all.size() || !all.stream().map(Area::getId).allMatch(req.ids()::contains)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_ORDER", "Send every area id exactly once.");
		}
		Map<Long, Area> byId = new HashMap<>();
		all.forEach(a -> byId.put(a.getId(), a));
		for (int i = 0; i < req.ids().size(); i++) {
			byId.get(req.ids().get(i)).setSortOrder(i + 1);
		}
		return list();
	}
}
