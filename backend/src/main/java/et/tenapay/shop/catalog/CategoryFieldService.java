package et.tenapay.shop.catalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import et.tenapay.shop.user.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Admin → Categories → Fields: what each category asks sellers (brand and model lists, RAM, storage, bed size, ...). */
@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryFieldService {

	static final int MAX_OPTIONS = 600;

	private final CategoryFieldRepository fields;
	private final CategoryRepository categories;
	private final CatalogChangeRepository changes;
	private final SpecsService specs;
	private final TransactionTemplate tx;

	/**
	 * {@code options}: a list (["64 GB", "128 GB"]), or with {@code dependsOn} a map from the parent field's answer to
	 * its list ({"Samsung": ["Galaxy A15"], "Apple": ["iPhone 13"]}).
	 */
	public record FieldForm(String label, String key, CategoryField.Type type, String unit, Object options, String dependsOn,
			Boolean allowOther, Boolean required, Boolean filterable, Boolean active, String help) {
	}

	public CategoryField create(Long categoryId, FieldForm f) {
		return tx.execute(s -> {
			Category c = categories.findById(categoryId).orElseThrow(() -> ApiException.notFound("Category"));
			if (blank(f.label())) {
				throw bad("LABEL_REQUIRED", "Enter the field's name, e.g. Storage.");
			}
			if (f.type() == null) {
				throw bad("TYPE_REQUIRED", "Choose the kind of answer.");
			}
			String key = keyOf(blank(f.key()) ? f.label() : f.key());
			if (key.isEmpty()) {
				throw bad("KEY_INVALID", "Use letters or numbers in the name.");
			}
			if (specs.allFieldsFor(c.getId()).stream().anyMatch(x -> x.getKey().equals(key))
					|| categories.findByParentIdOrderBySortOrderAscIdAsc(c.getId()).stream()
							.anyMatch(sub -> fields.existsByCategoryIdAndKey(sub.getId(), key))) {
				throw new ApiException(HttpStatus.CONFLICT, "KEY_TAKEN", "This category (or its main or subcategory) already has a field \"" + key + "\".");
			}
			CategoryField field = new CategoryField();
			field.setCategoryId(c.getId());
			field.setKey(key);
			field.setPosition(fields.maxPosition(c.getId()) + 1);
			apply(field, f, true);
			fields.save(field);
			record(c.getId(), "FIELD_ADDED", field.getLabel() + " (" + field.getType() + ")");
			return field;
		});
	}

	public CategoryField update(Long categoryId, Long fieldId, FieldForm f) {
		return tx.execute(s -> {
			CategoryField field = own(categoryId, fieldId);
			apply(field, f, false);
			record(categoryId, "FIELD_EDITED", field.getLabel());
			return field;
		});
	}

	/** Removes the field; answers already on products stay in their data but are no longer shown. */
	public void delete(Long categoryId, Long fieldId) {
		tx.executeWithoutResult(s -> {
			CategoryField field = own(categoryId, fieldId);
			fields.delete(field);
			record(categoryId, "FIELD_REMOVED", field.getLabel());
		});
	}

	public void reorder(Long categoryId, List<Long> ids) {
		tx.executeWithoutResult(s -> {
			List<CategoryField> all = fields.findByCategoryIdOrderByPositionAscIdAsc(categoryId);
			if (ids == null || ids.size() != all.size() || !all.stream().map(CategoryField::getId).allMatch(ids::contains)) {
				throw bad("BAD_ORDER", "Send every field id of this category exactly once.");
			}
			for (CategoryField f : all) {
				f.setPosition(ids.indexOf(f.getId()) + 1);
			}
			record(categoryId, "FIELDS_REORDERED", null);
		});
	}

	private void apply(CategoryField field, FieldForm f, boolean creating) {
		if (!blank(f.label())) {
			field.setLabel(cut(f.label(), 80));
		}
		if (f.type() != null) {
			field.setType(f.type());
		}
		if (creating || f.unit() != null) {
			field.setUnit(blank(f.unit()) ? null : cut(f.unit(), 16));
		}
		if (creating || f.help() != null) {
			field.setHelp(blank(f.help()) ? null : cut(f.help(), 200));
		}
		if (creating || f.dependsOn() != null) {
			String parent = blank(f.dependsOn()) ? null : f.dependsOn().trim();
			if (parent != null) {
				if (parent.equals(field.getKey())) {
					throw bad("DEPENDS_INVALID", "A field can't depend on itself.");
				}
				CategoryField p = specs.allFieldsFor(field.getCategoryId()).stream().filter(x -> x.getKey().equals(parent)).findFirst()
						.orElseThrow(() -> bad("DEPENDS_INVALID", "Choose a field of this category to depend on."));
				if (p.getType() != CategoryField.Type.SELECT) {
					throw bad("DEPENDS_INVALID", "A list can only depend on a one-choice field (like Brand).");
				}
			}
			field.setDependsOn(parent);
		}
		if (creating || f.options() != null) {
			field.setOptions(specs.writeOptions(cleanOptions(f.options(), field.getDependsOn() != null)));
		}
		boolean list = field.getType() == CategoryField.Type.SELECT || field.getType() == CategoryField.Type.MULTI;
		if (!list) {
			field.setOptions(null);
			field.setDependsOn(null);
		}
		if (f.allowOther() != null) {
			field.setAllowOther(f.allowOther());
		}
		if (f.required() != null) {
			field.setRequired(f.required());
		}
		if (f.filterable() != null) {
			field.setFilterable(f.filterable());
		}
		if (f.active() != null) {
			field.setActive(f.active());
		}
		if (list && field.getOptions() == null && !field.isAllowOther()) {
			throw bad("OPTIONS_REQUIRED", "Add the choices (one per line), or allow \"Other\" so sellers can type it.");
		}
	}

	/** Trims, drops blanks and duplicates, limits sizes; a map when the list depends on another field. */
	private static Object cleanOptions(Object raw, boolean dependent) {
		if (raw == null) {
			return null;
		}
		if (dependent) {
			if (!(raw instanceof Map<?, ?> m)) {
				throw bad("OPTIONS_INVALID", "For a list that depends on another field, give a list per answer (e.g. per brand).");
			}
			Map<String, List<String>> out = new LinkedHashMap<>();
			int total = 0;
			for (Map.Entry<?, ?> e : m.entrySet()) {
				String k = cut(String.valueOf(e.getKey()), 80);
				List<String> l = cleanList(e.getValue());
				if (!k.isEmpty() && !l.isEmpty()) {
					out.put(k, l);
					total += l.size();
				}
			}
			if (total > MAX_OPTIONS * 3) {
				throw bad("OPTIONS_TOO_MANY", "That's too many choices. Keep it under " + MAX_OPTIONS * 3 + ".");
			}
			return out.isEmpty() ? null : out;
		}
		List<String> l = cleanList(raw);
		return l.isEmpty() ? null : l;
	}

	private static List<String> cleanList(Object raw) {
		List<?> in = raw instanceof List<?> l ? l : List.of(String.valueOf(raw).split("\\r?\\n"));
		List<String> out = new ArrayList<>();
		for (Object o : in) {
			if (o == null) {
				continue;
			}
			String v = cut(String.valueOf(o), 80);
			if (!v.isEmpty() && out.stream().noneMatch(x -> x.equalsIgnoreCase(v))) {
				out.add(v);
			}
		}
		if (out.size() > MAX_OPTIONS) {
			throw bad("OPTIONS_TOO_MANY", "Keep a list under " + MAX_OPTIONS + " choices.");
		}
		return out;
	}

	private CategoryField own(Long categoryId, Long fieldId) {
		return fields.findById(fieldId).filter(x -> Objects.equals(x.getCategoryId(), categoryId))
				.orElseThrow(() -> ApiException.notFound("Field"));
	}

	/** "Screen size" → "screen_size". */
	static String keyOf(String s) {
		String k = s.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
		return k.length() > 40 ? k.substring(0, 40) : k;
	}

	private void record(Long categoryId, String action, String detail) {
		CatalogChange c = new CatalogChange();
		c.setEntityType(CatalogChange.EntityType.CATEGORY);
		c.setEntityId(categoryId);
		c.setAction(action);
		c.setDetail(detail);
		CurrentUser.get().ifPresent(u -> {
			c.setUserId(u.id());
			c.setUserEmail(u.email());
		});
		changes.save(c);
		log.info("Category #{} {} {}", categoryId, action, detail == null ? "" : detail);
	}

	private static boolean blank(String s) {
		return s == null || s.isBlank();
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}

	private static ApiException bad(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}
}
