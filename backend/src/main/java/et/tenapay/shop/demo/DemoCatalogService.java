package et.tenapay.shop.demo;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.common.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Demo listings for testing: 13 made-up Sodo shops and about 170 listings with photos in every category
 * (laptops, phones, furniture, clothes, food, ...). Loaded and removed from Admin → Demo data.
 * Everything it adds has a slug starting with "demo-", so it never touches real shops or listings.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DemoCatalogService {

	static final String PREFIX = "demo-";
	private static final String CATALOG = "demo/catalog.json";

	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final ObjectMapper json;

	public record Status(int listingsInFile, int shopsInFile, int listingsLoaded, int listingsVisible, int shopsLoaded) {
	}

	public record LoadResult(int listingsAdded, int listingsRestored, int shopsAdded, int categoriesAdded) {
	}

	public record RemoveResult(int listingsDeleted, int listingsHidden, int shopsDeleted, int shopsClosed) {
	}

	public Status status() {
		JsonNode c = catalog();
		return new Status(c.path("products").size(), c.path("shops").size(),
				count("select count(*) from products where slug like 'demo-%'"),
				count("select count(*) from products where slug like 'demo-%' and active"),
				count("select count(*) from shops where slug like 'demo-%' and status = 'APPROVED'"));
	}

	/** Adds what is missing and shows again what was hidden; safe to press twice. */
	public LoadResult load() {
		JsonNode c = catalog();
		return tx.execute(s -> {
			int categoriesAdded = 0;
			for (JsonNode cat : c.path("categories")) {
				if (categoryId(cat.path("slug").asString()) == null) {
					Long parent = cat.hasNonNull("parent") ? categoryId(cat.path("parent").asString()) : null;
					jdbc.update("insert into categories (name, slug, parent_id, sort_order, active) values (?, ?, ?, "
							+ "(select coalesce(max(sort_order), 0) + 1 from categories), true)",
							cat.path("name").asString(), cat.path("slug").asString(), parent);
					categoriesAdded++;
				}
			}

			int shopsAdded = 0;
			Map<String, Long> shopIds = new HashMap<>();
			Map<String, String> shopAreas = new HashMap<>();
			for (JsonNode sh : c.path("shops")) {
				String slug = PREFIX + sh.path("slug").asString();
				shopAreas.put(sh.path("slug").asString(), sh.path("area").asString());
				Long id = jdbc.query("select id from shops where slug = ?", rs -> rs.next() ? rs.getLong(1) : null, slug);
				if (id == null) {
					UUID owner = UUID.randomUUID();
					// a seller account nobody can sign in to (no password, made-up phone)
					jdbc.update("insert into users (id, email, password_hash, full_name, phone, role, enabled) values (?, ?, null, ?, ?, 'CUSTOMER', true)",
							owner, slug + "@demo.sodogebeya.et", sh.path("name").asString(), sh.path("phone").asString());
					Timestamp now = Timestamp.from(Instant.now());
					jdbc.update("insert into shops (owner_id, kind, name, slug, description, phone, area, address_line, status, decided_at, decided_by, verified_at) "
							+ "values (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, 'demo data', ?)",
							owner, sh.path("kind").asString(), sh.path("name").asString(), slug, sh.path("about").asString(),
							sh.path("phone").asString(), sh.path("area").asString(), text(sh, "address"), now, now);
					id = jdbc.queryForObject("select id from shops where slug = ?", Long.class, slug);
					shopsAdded++;
				} else {
					jdbc.update("update shops set status = 'APPROVED', status_note = null where id = ?", id);
				}
				shopIds.put(sh.path("slug").asString(), id);
			}

			int added = 0;
			int restored = 0;
			int i = 0;
			for (JsonNode p : c.path("products")) {
				String slug = p.path("slug").asString();
				Long catId = categoryId(p.path("category").asString());
				if (catId == null) {
					throw new ApiException(HttpStatus.CONFLICT, "DEMO_CATEGORY_MISSING",
							"Category " + p.path("category").asString() + " is missing; add it back in Admin → Categories");
				}
				Boolean active = jdbc.query("select active from products where slug = ?", rs -> rs.next() ? rs.getBoolean(1) : null, slug);
				if (active == null) {
					// spread "listed at" over the last weeks so "newest first" looks natural
					Timestamp created = Timestamp.from(Instant.now().minus(i * 3L, ChronoUnit.HOURS));
					jdbc.update("insert into products (category_id, shop_id, name, slug, description, price, currency, stock, image_url, "
							+ "featured, active, item_condition, negotiable, area, specs, created_at, updated_at) "
							+ "values (?, ?, ?, ?, ?, ?, 'ETB', ?, ?, ?, true, ?, ?, ?, ?::jsonb, ?, ?)",
							catId, shopIds.get(p.path("shop").asString()), p.path("name").asString(), slug, description(p),
							new BigDecimal(p.path("price").asString()), p.path("stock").asInt(5), "/demo/" + slug + ".jpg",
							p.path("featured").asBoolean(false), p.path("condition").asString("NEW"), p.path("negotiable").asBoolean(false),
							shopAreas.get(p.path("shop").asString()), json.writeValueAsString(p.path("specs")), created, created);
					added++;
				} else if (!active) {
					jdbc.update("update products set active = true where slug = ? and blocked_reason is null", slug);
					restored++;
				}
				i++;
			}
			log.info("Demo data loaded: {} listings added, {} shown again, {} shops, {} categories", added, restored, shopsAdded, categoriesAdded);
			return new LoadResult(added, restored, shopsAdded, categoriesAdded);
		});
	}

	/**
	 * Deletes demo listings nobody used; ones that were ordered, chatted about or reviewed are only hidden, so
	 * order history stays intact. Same for the demo shops. The added categories stay (they're useful).
	 */
	public RemoveResult remove() {
		int deleted = 0;
		int hidden = 0;
		List<Long> ids = jdbc.queryForList("select id from products where slug like 'demo-%'", Long.class);
		for (Long id : ids) {
			try {
				tx.executeWithoutResult(s -> {
					jdbc.update("delete from favourites where product_id = ?", id);
					jdbc.update("delete from products where id = ?", id);
				});
				deleted++;
			} catch (DataAccessException used) {
				jdbc.update("update products set active = false where id = ?", id);
				hidden++;
			}
		}
		int shopsDeleted = 0;
		int shopsClosed = 0;
		for (Map<String, Object> sh : jdbc.queryForList("select id, owner_id from shops where slug like 'demo-%'")) {
			Object id = sh.get("id");
			Object owner = sh.get("owner_id");
			try {
				tx.executeWithoutResult(s -> {
					jdbc.update("delete from shops where id = ?", id);
					jdbc.update("delete from users where id = ?", owner);
				});
				shopsDeleted++;
			} catch (DataAccessException used) {
				jdbc.update("update shops set status = 'SUSPENDED', status_note = 'Demo data removed' where id = ?", id);
				shopsClosed++;
			}
		}
		log.info("Demo data removed: {} listings deleted, {} hidden, {} shops deleted, {} closed", deleted, hidden, shopsDeleted, shopsClosed);
		return new RemoveResult(deleted, hidden, shopsDeleted, shopsClosed);
	}

	private static String description(JsonNode p) {
		String d = text(p, "description");
		if (d != null) {
			return d;
		}
		return switch (p.path("condition").asString("NEW")) {
			case "USED" -> "Used, in good working condition. You can come and check it before buying. Price is a little negotiable.";
			case "LIKE_NEW" -> "Like new, hardly used. Fully checked and cleaned.";
			default -> "Brand new. Delivery anywhere in Sodo; pay safely online with BillPay.";
		};
	}

	private static String text(JsonNode n, String field) {
		return n.hasNonNull(field) && !n.path(field).asString().isBlank() ? n.path(field).asString() : null;
	}

	private Long categoryId(String slug) {
		return jdbc.query("select id from categories where slug = ?", rs -> rs.next() ? rs.getLong(1) : null, slug);
	}

	private int count(String sql) {
		Integer n = jdbc.queryForObject(sql, Integer.class);
		return n == null ? 0 : n;
	}

	private JsonNode catalog() {
		try (InputStream in = new ClassPathResource(CATALOG).getInputStream()) {
			return json.readTree(in);
		} catch (IOException e) {
			throw new IllegalStateException("Cannot read " + CATALOG, e);
		}
	}
}
