package et.tenapay.shop.admin;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.catalog.CategoryField;
import et.tenapay.shop.catalog.CategoryFieldService;
import et.tenapay.shop.catalog.SpecsService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/** Admin → Categories → a category → Fields: the details sellers fill in and shoppers filter by. */
@RestController
@RequestMapping("/api/admin/categories/{categoryId}/fields")
@RequiredArgsConstructor
public class CategoryFieldAdminController {

	private final CategoryFieldService service;
	private final SpecsService specs;

	public record FieldRequest(@Size(max = 80) String label, @Size(max = 40) String key, CategoryField.Type type,
			@Size(max = 16) String unit, Object options, @Size(max = 40) String dependsOn, Boolean allowOther,
			Boolean required, Boolean filterable, Boolean active, @Size(max = 200) String help) {

		CategoryFieldService.FieldForm form() {
			return new CategoryFieldService.FieldForm(label, key, type, unit, options, dependsOn, allowOther, required, filterable,
					active, help);
		}
	}

	public record OrderRequest(@NotNull List<Long> ids) {
	}

	/** This category's fields, after its main category's (marked inherited), hidden ones included. */
	@GetMapping
	@Transactional(readOnly = true)
	public List<SpecsService.FieldView> list(@PathVariable Long categoryId) {
		return specs.views(categoryId, true);
	}

	@PostMapping
	public List<SpecsService.FieldView> create(@PathVariable Long categoryId, @Valid @RequestBody FieldRequest req) {
		service.create(categoryId, req.form());
		return specs.views(categoryId, true);
	}

	@PutMapping("/{fieldId}")
	public List<SpecsService.FieldView> update(@PathVariable Long categoryId, @PathVariable Long fieldId,
			@Valid @RequestBody FieldRequest req) {
		service.update(categoryId, fieldId, req.form());
		return specs.views(categoryId, true);
	}

	@DeleteMapping("/{fieldId}")
	public List<SpecsService.FieldView> delete(@PathVariable Long categoryId, @PathVariable Long fieldId) {
		service.delete(categoryId, fieldId);
		return specs.views(categoryId, true);
	}

	@PutMapping("/order")
	public List<SpecsService.FieldView> reorder(@PathVariable Long categoryId, @Valid @RequestBody OrderRequest req) {
		service.reorder(categoryId, req.ids());
		return specs.views(categoryId, true);
	}
}
