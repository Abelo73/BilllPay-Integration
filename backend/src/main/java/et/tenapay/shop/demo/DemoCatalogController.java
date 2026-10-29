package et.tenapay.shop.demo;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** Admin → Demo data. Reading is open to staff; loading and removing are admin-only (security config). */
@RestController
@RequestMapping("/api/admin/demo-data")
@RequiredArgsConstructor
public class DemoCatalogController {

	private final DemoCatalogService demo;

	@GetMapping
	public DemoCatalogService.Status status() {
		return demo.status();
	}

	@PostMapping
	public DemoCatalogService.LoadResult load() {
		return demo.load();
	}

	@DeleteMapping
	public DemoCatalogService.RemoveResult remove() {
		return demo.remove();
	}
}
