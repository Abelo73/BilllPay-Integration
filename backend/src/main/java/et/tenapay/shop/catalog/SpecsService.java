package et.tenapay.shop.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import et.tenapay.shop.common.ApiException;
import lombok.RequiredArgsConstructor;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Category detail fields (brand, model, RAM, storage, chip, bed size, ...) and the answers on each product. A
 * subcategory asks its main category's fields first, then its own. Answers are checked against the lists, unknown
 * keys are dropped, and numbers are stored as numbers so shoppers can filter.
 */
@Service
@RequiredArgsConstructor
public class SpecsService {

	public static final String OTHER = "Other";

	private final CategoryFieldRepository fields;
	private final CategoryRepository categories;
	private final ObjectMapper json;
	private final JdbcTemplate jdbc;

	/** A field as the store and the listing form see it. {@code options}: a list, or brand → models when dependent. */
	public record FieldView(Long id, Long categoryId, boolean inherited, String key, String label, String type, String unit,
			Object options, String dependsOn, boolean allowOther, boolean required, boolean filterable, int position,
			boolean active, String help) {
	}

	public record SpecLine(String key, String label, String value) {
	}

	/** Values shoppers can filter by, with how many listings have each. */
	public record Facet(String key, String label, String type, List<FacetValue> values) {
	}

	public record FacetValue(String value, long count) {
	}

	// ---------- fields ----------

	/** Active fields a product in this category answers: the subcategory's, then its main category's. */
	public List<CategoryField> fieldsFor(Long categoryId) {
		return allFieldsFor(categoryId).stream().filter(CategoryField::isActive).toList();
	}

	List<CategoryField> allFieldsFor(Long categoryId) {
		if (categoryId == null) {
			return List.of();
		}
		Category c = categories.findById(categoryId).orElse(null);
		if (c == null) {
			return List.of();
		}
		// the subcategory's own fields first (brand, model, ...), then the main category's general ones (warranty)
		List<CategoryField> out = new ArrayList<>(fields.findByCategoryIdOrderByPositionAscIdAsc(c.getId()));
		if (c.getParentId() != null) {
			out.addAll(fields.findByCategoryIdOrderByPositionAscIdAsc(c.getParentId()));
		}
		return out;
	}

	public List<FieldView> views(Long categoryId, boolean includeHidden) {
		return (includeHidden ? allFieldsFor(categoryId) : fieldsFor(categoryId)).stream()
				.map(f -> view(f, !f.getCategoryId().equals(categoryId))).toList();
	}

	public FieldView view(CategoryField f, boolean inherited) {
		return new FieldView(f.getId(), f.getCategoryId(), inherited, f.getKey(), f.getLabel(), f.getType().name(), f.getUnit(),
				parseOptions(f.getOptions()), f.getDependsOn(), f.isAllowOther(), f.isRequired(), f.isFilterable(), f.getPosition(),
				f.isActive(), f.getHelp());
	}

	public Object parseOptions(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		return json.readValue(raw, Object.class);
	}

	public String writeOptions(Object options) {
		return options == null ? null : json.writeValueAsString(options);
	}

	// ---------- answers ----------

	public Map<String, Object> read(String specsJson) {
		if (specsJson == null || specsJson.isBlank()) {
			return new LinkedHashMap<>();
		}
		return json.readValue(specsJson, new TypeReference<LinkedHashMap<String, Object>>() {
		});
	}

	public String write(Map<String, Object> specs) {
		return json.writeValueAsString(specs == null ? Map.of() : specs);
	}

	/**
	 * Checks a product's answers against its category's fields and returns the JSON to store. Unknown keys and empty
	 * answers are dropped; a missing required answer or a value that isn't in the list is a 400 with per-field errors
	 * ({@code errors["specs.brand"]}), which the listing form shows under each field.
	 */
	public String clean(Long categoryId, Map<String, Object> raw) {
		Map<String, Object> in = raw == null ? Map.of() : raw;
		Map<String, Object> out = new LinkedHashMap<>();
		Map<String, String> errors = new LinkedHashMap<>();
		for (CategoryField f : fieldsFor(categoryId)) {
			Object v = in.get(f.getKey());
			try {
				Object clean = cleanValue(f, v, out);
				if (clean != null) {
					out.put(f.getKey(), clean);
				} else if (f.isRequired()) {
					errors.put("specs." + f.getKey(), (f.getType() == CategoryField.Type.SELECT ? "Choose " : "Enter ") + f.getLabel().toLowerCase(Locale.ROOT) + ".");
				}
			} catch (IllegalArgumentException bad) {
				errors.put("specs." + f.getKey(), bad.getMessage());
			}
		}
		if (!errors.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "SPECS_INVALID", errors.values().iterator().next(), Map.of("errors", errors));
		}
		return write(out);
	}

	private Object cleanValue(CategoryField f, Object v, Map<String, Object> soFar) {
		if (v == null || (v instanceof String s && s.isBlank()) || (v instanceof Collection<?> c && c.isEmpty())) {
			return null;
		}
		return switch (f.getType()) {
			case TEXT -> cut(String.valueOf(v), 200);
			case NUMBER -> {
				BigDecimal n;
				try {
					n = new BigDecimal(String.valueOf(v).trim().replace(",", ""));
				} catch (NumberFormatException e) {
					throw new IllegalArgumentException(f.getLabel() + " must be a number.");
				}
				if (n.signum() < 0 || n.compareTo(BigDecimal.valueOf(10_000_000)) > 0) {
					throw new IllegalArgumentException(f.getLabel() + " is out of range.");
				}
				n = n.stripTrailingZeros();
				yield n.scale() <= 0 ? (Object) n.longValueExact() : (Object) n.doubleValue();
			}
			case YES_NO -> {
				String s = String.valueOf(v).trim().toLowerCase(Locale.ROOT);
				if (s.equals("true") || s.equals("yes")) {
					yield true;
				}
				if (s.equals("false") || s.equals("no")) {
					yield false;
				}
				throw new IllegalArgumentException("Choose yes or no for " + f.getLabel().toLowerCase(Locale.ROOT) + ".");
			}
			case SELECT -> pick(f, String.valueOf(v), soFar);
			case MULTI -> {
				List<String> picked = new ArrayList<>();
				Collection<?> items = v instanceof Collection<?> c ? c : List.of(String.valueOf(v).split(","));
				for (Object item : items) {
					if (item != null && !String.valueOf(item).isBlank()) {
						String p = pick(f, String.valueOf(item), soFar);
						if (!picked.contains(p)) {
							picked.add(p);
						}
					}
				}
				yield picked.isEmpty() ? null : picked.subList(0, Math.min(picked.size(), 20));
			}
		};
	}

	/** A value from the field's list (case-insensitive), or the typed value when "Other" is allowed. */
	private String pick(CategoryField f, String value, Map<String, Object> soFar) {
		String v = cut(value, 80);
		List<String> list = listFor(f, soFar);
		if (list == null) {
			return v; // no list (yet): anything goes
		}
		for (String option : list) {
			if (option.equalsIgnoreCase(v)) {
				return option;
			}
		}
		if (f.isAllowOther()) {
			return v;
		}
		throw new IllegalArgumentException("Choose " + f.getLabel().toLowerCase(Locale.ROOT) + " from the list.");
	}

	/** The options for this answer: the plain list, or the list for the parent's answer (Samsung → its models). */
	@SuppressWarnings("unchecked")
	List<String> listFor(CategoryField f, Map<String, Object> answers) {
		Object options = parseOptions(f.getOptions());
		if (options instanceof List<?> l) {
			return (List<String>) l;
		}
		if (options instanceof Map<?, ?> m) {
			Object parent = f.getDependsOn() == null ? null : answers.get(f.getDependsOn());
			if (parent == null) {
				return null;
			}
			for (Map.Entry<?, ?> e : m.entrySet()) {
				if (String.valueOf(e.getKey()).equalsIgnoreCase(String.valueOf(parent))) {
					return (List<String>) e.getValue();
				}
			}
			return null; // a brand without a model list ("Other" brand): free text
		}
		return null;
	}

	// ---------- showing ----------

	/** The product page's "Details" table, in the category's field order. */
	public List<SpecLine> lines(Long categoryId, String specsJson) {
		Map<String, Object> specs = read(specsJson);
		if (specs.isEmpty()) {
			return List.of();
		}
		List<SpecLine> out = new ArrayList<>();
		for (CategoryField f : fieldsFor(categoryId)) {
			Object v = specs.get(f.getKey());
			if (v != null) {
				out.add(new SpecLine(f.getKey(), f.getLabel(), text(f, v)));
			}
		}
		return out;
	}

	static String text(CategoryField f, Object v) {
		String unit = f.getUnit() == null || f.getUnit().isBlank() ? "" : " " + f.getUnit();
		return switch (f.getType()) {
			case YES_NO -> Boolean.TRUE.equals(v) ? "Yes" : "No";
			case MULTI -> v instanceof Collection<?> c ? String.join(", ", c.stream().map(String::valueOf).toList()) : String.valueOf(v);
			case NUMBER -> String.valueOf(v) + unit;
			default -> String.valueOf(v);
		};
	}

	// ---------- filtering ----------

	/**
	 * Shop filters as one JSON object for "specs contains": {"brand":"Samsung","features":["5G"],"dual_sim":true}.
	 * Only filterable fields of the category count; null when nothing is filtered.
	 */
	public String filterJson(Long categoryId, Map<String, String> wanted) {
		if (categoryId == null || wanted.isEmpty()) {
			return null;
		}
		Map<String, Object> out = new TreeMap<>();
		for (CategoryField f : fieldsFor(categoryId)) {
			String v = wanted.get(f.getKey());
			if (v == null || v.isBlank() || !f.isFilterable()) {
				continue;
			}
			switch (f.getType()) {
				case MULTI -> out.put(f.getKey(), List.of(v));
				case YES_NO -> out.put(f.getKey(), "true".equalsIgnoreCase(v) || "yes".equalsIgnoreCase(v));
				case NUMBER -> {
					try {
						BigDecimal n = new BigDecimal(v).stripTrailingZeros();
						out.put(f.getKey(), n.scale() <= 0 ? (Object) n.longValueExact() : (Object) n.doubleValue());
					} catch (RuntimeException ignored) {
						// not a number: no filter
					}
				}
				default -> out.put(f.getKey(), v);
			}
		}
		return out.isEmpty() ? null : write(out);
	}

	/** Counts per value of each filterable field among the category's visible listings (and its subcategories'). */
	public List<Facet> facets(Category category) {
		List<CategoryField> filterable = fieldsFor(category.getId()).stream()
				.filter(f -> f.isFilterable() && f.getType() != CategoryField.Type.TEXT).toList();
		if (filterable.isEmpty()) {
			return List.of();
		}
		List<String> rows = jdbc.queryForList("""
				select p.specs::text from products p
				join categories c on c.id = p.category_id
				left join shops s on s.id = p.shop_id
				where p.active and c.active and p.blocked_reason is null
				  and (p.shop_id is null or s.status = 'APPROVED')
				  and (c.id = ? or c.parent_id = ?)
				order by p.id desc limit 5000
				""", String.class, category.getId(), category.getId());
		Map<String, Map<String, Long>> counts = new HashMap<>();
		for (String row : rows) {
			Map<String, Object> specs = read(row);
			for (CategoryField f : filterable) {
				Object v = specs.get(f.getKey());
				if (v == null) {
					continue;
				}
				Map<String, Long> c = counts.computeIfAbsent(f.getKey(), k -> new LinkedHashMap<>());
				if (v instanceof Collection<?> many) {
					many.forEach(x -> c.merge(String.valueOf(x), 1L, Long::sum));
				} else {
					c.merge(f.getType() == CategoryField.Type.YES_NO ? (Boolean.TRUE.equals(v) ? "true" : "false") : String.valueOf(v), 1L, Long::sum);
				}
			}
		}
		List<Facet> out = new ArrayList<>();
		for (CategoryField f : filterable) {
			Map<String, Long> c = counts.get(f.getKey());
			if (c == null || c.isEmpty()) {
				continue;
			}
			List<String> order = listOrder(f);
			List<FacetValue> values = c.entrySet().stream()
					.sorted((a, b) -> {
						int ia = order.indexOf(a.getKey());
						int ib = order.indexOf(b.getKey());
						if (ia >= 0 && ib >= 0) {
							return Integer.compare(ia, ib);
						}
						return Long.compare(b.getValue(), a.getValue());
					})
					.map(e -> new FacetValue(e.getKey(), e.getValue())).toList();
			out.add(new Facet(f.getKey(), f.getLabel(), f.getType().name(), values));
		}
		return out;
	}

	/** The list order (16 GB before 128 GB), so filters read naturally. */
	@SuppressWarnings("unchecked")
	private List<String> listOrder(CategoryField f) {
		Object o = parseOptions(f.getOptions());
		if (o instanceof List<?> l) {
			return (List<String>) l;
		}
		if (o instanceof Map<?, ?> m) {
			List<String> all = new ArrayList<>();
			m.values().forEach(v -> all.addAll((List<String>) v));
			return all;
		}
		return List.of();
	}

	private static String cut(String s, int max) {
		String t = s.trim();
		return t.length() > max ? t.substring(0, max) : t;
	}
}
