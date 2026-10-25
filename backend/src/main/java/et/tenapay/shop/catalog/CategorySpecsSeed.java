package et.tenapay.shop.catalog;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import et.tenapay.shop.catalog.CategoryField.Type;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Starter subcategories and detail fields (brand and model lists, RAM, storage, chip, bed sizes, ...), added once.
 * After that everything is managed in Admin → Categories; this never runs again (app_settings "seed.category_specs").
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class CategorySpecsSeed implements ApplicationRunner {

	static final String DONE_KEY = "seed.category_specs";

	private final CategoryRepository categories;
	private final CategoryFieldRepository fields;
	private final SpecsService specs;
	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;

	@Override
	public void run(ApplicationArguments args) {
		Integer done = jdbc.queryForObject("select count(*) from app_settings where key = ?", Integer.class, DONE_KEY);
		if (done != null && done > 0) {
			return;
		}
		tx.executeWithoutResult(s -> {
			seed();
			jdbc.update("insert into app_settings (key, value, updated_at, updated_by) values (?, ?, ?, ?)", DONE_KEY, "v1",
					java.sql.Timestamp.from(Instant.now()), "system");
		});
		log.info("Added starter subcategories and detail fields (phones, laptops, TVs, beds, tables, clothes, ...)");
	}

	// ---------- the data ----------

	private void seed() {
		Category electronics = main("electronics", "Electronics");
		Category home = main("home-living", "Home & Living");
		Category fashion = main("fashion", "Fashion");

		fieldsOf(electronics, select("warranty", "Warranty", "No warranty", "1 month", "3 months", "6 months", "1 year", "2 years"));

		fieldsOf(sub(electronics, "mobile-phones", "Mobile phones"),
				select("brand", "Brand", PHONE_BRANDS).req().filter().other(),
				dependent("model", "Model", "brand", phoneModels()).req().filter().other(),
				select("storage", "Storage", "8 GB", "16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB").req().filter(),
				select("ram", "RAM", "1 GB", "2 GB", "3 GB", "4 GB", "6 GB", "8 GB", "12 GB", "16 GB").filter(),
				select("chip", "Chip (processor)", PHONE_CHIPS).other().help("Optional. Settings → About phone shows it."),
				number("screen", "Screen size", "inch"),
				number("battery", "Battery", "mAh"),
				number("camera", "Main camera", "MP"),
				select("sim", "SIM", "Single SIM", "Dual SIM", "eSIM", "Dual SIM + eSIM").filter(),
				select("network", "Network", "3G", "4G", "5G").filter(),
				number("battery_health", "Battery health", "%").help("Used phones. iPhone: Settings → Battery → Battery health."),
				select("color", "Color", COLORS).other(),
				multi("features", "Features", "Fingerprint", "Face unlock", "NFC", "Wireless charging", "Fast charging",
						"Memory card slot", "Water resistant").filter(),
				multi("in_box", "Comes with", "Box", "Charger", "Cable", "Earphones", "Receipt"));

		fieldsOf(sub(electronics, "tablets", "Tablets"),
				select("brand", "Brand", "Apple", "Samsung", "Lenovo", "Huawei", "Xiaomi", "Tecno", "Infinix", "Amazon", "Microsoft").req().filter().other(),
				dependent("model", "Model", "brand", Map.of(
						"Apple", List.of("iPad", "iPad mini", "iPad Air", "iPad Pro 11\"", "iPad Pro 12.9\"", "iPad Pro 13\""),
						"Samsung", List.of("Galaxy Tab A7 Lite", "Galaxy Tab A8", "Galaxy Tab A9", "Galaxy Tab A9+", "Galaxy Tab S6 Lite",
								"Galaxy Tab S7", "Galaxy Tab S8", "Galaxy Tab S9", "Galaxy Tab S9 FE", "Galaxy Tab S10"),
						"Lenovo", List.of("Tab M8", "Tab M10", "Tab M11", "Tab P11", "Tab P12"),
						"Huawei", List.of("MatePad T10", "MatePad SE", "MatePad 11"),
						"Xiaomi", List.of("Redmi Pad SE", "Redmi Pad Pro", "Xiaomi Pad 6"))).filter().other(),
				select("storage", "Storage", "16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB").req().filter(),
				select("ram", "RAM", "2 GB", "3 GB", "4 GB", "6 GB", "8 GB", "12 GB", "16 GB").filter(),
				number("screen", "Screen size", "inch"),
				select("connectivity", "Connection", "Wi-Fi only", "Wi-Fi + SIM (cellular)").filter(),
				number("battery_health", "Battery health", "%"),
				select("color", "Color", COLORS).other(),
				multi("features", "Comes with / features", "Pen", "Keyboard", "Case", "Charger", "Fingerprint", "Face unlock"));

		fieldsOf(sub(electronics, "laptops", "Laptops"),
				select("brand", "Brand", LAPTOP_BRANDS).req().filter().other(),
				dependent("series", "Series", "brand", laptopSeries()).filter().other(),
				text("model", "Exact model").help("Optional, e.g. EliteBook 840 G5 or MacBook Air M2 13\"."),
				select("processor", "Processor", PROCESSORS).req().filter().other(),
				select("generation", "Intel generation", IntStream.rangeClosed(4, 14).mapToObj(n -> n + "th gen").toArray(String[]::new))
						.filter().help("Intel only: i5-8250U is 8th gen."),
				select("ram", "RAM", "2 GB", "4 GB", "8 GB", "12 GB", "16 GB", "24 GB", "32 GB", "64 GB").req().filter(),
				select("storage", "Storage", "64 GB", "128 GB", "256 GB", "500 GB", "512 GB", "1 TB", "2 TB").req().filter(),
				select("storage_type", "Storage type", "SSD", "HDD", "SSD + HDD", "eMMC").filter(),
				select("screen", "Screen size", "11.6 inch", "12.5 inch", "13.3 inch", "13.6 inch", "14 inch", "15.6 inch", "16 inch", "17.3 inch").filter().other(),
				select("graphics", "Graphics", GRAPHICS).other().filter(),
				select("os", "Operating system", "Windows 11", "Windows 10", "macOS", "Linux", "ChromeOS", "No OS").filter(),
				yesNo("touchscreen", "Touchscreen").filter(),
				text("battery_life", "Battery lasts").help("e.g. about 4 hours"),
				multi("features", "Features", "Backlit keyboard", "Fingerprint reader", "Face login", "2-in-1 (folds into a tablet)",
						"HDMI port", "USB-C charging", "SIM card slot", "Charger included", "Bag included").filter(),
				select("color", "Color", COLORS).other());

		fieldsOf(sub(electronics, "desktop-computers", "Desktop computers"),
				select("type", "Type", "Tower", "All-in-one", "Mini PC", "Gaming PC", "Workstation").req().filter(),
				select("brand", "Brand", "HP", "Dell", "Lenovo", "Apple", "Asus", "Acer", "Custom build").filter().other(),
				select("processor", "Processor", PROCESSORS).req().filter().other(),
				select("generation", "Intel generation", IntStream.rangeClosed(4, 14).mapToObj(n -> n + "th gen").toArray(String[]::new)).filter(),
				select("ram", "RAM", "4 GB", "8 GB", "16 GB", "32 GB", "64 GB", "128 GB").req().filter(),
				select("storage", "Storage", "128 GB", "256 GB", "500 GB", "512 GB", "1 TB", "2 TB", "4 TB").req().filter(),
				select("storage_type", "Storage type", "SSD", "HDD", "SSD + HDD").filter(),
				select("graphics", "Graphics", GRAPHICS).other(),
				yesNo("monitor", "Monitor included").filter(),
				number("monitor_size", "Monitor size", "inch"),
				select("os", "Operating system", "Windows 11", "Windows 10", "macOS", "Linux", "No OS").filter());

		fieldsOf(sub(electronics, "tvs", "TVs"),
				select("brand", "Brand", "Samsung", "LG", "Sony", "TCL", "Hisense", "Skyworth", "Haier", "Xiaomi", "Philips", "Panasonic",
						"Sharp", "Toshiba").req().filter().other(),
				select("screen", "Screen size", "24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "58 inch", "65 inch",
						"75 inch", "85 inch").req().filter().other(),
				select("display", "Display", "LED", "QLED", "OLED", "Mini-LED").filter(),
				select("resolution", "Resolution", "HD", "Full HD", "4K UHD", "8K").filter(),
				yesNo("smart", "Smart TV").filter(),
				select("tv_os", "TV system", "Google TV / Android TV", "Tizen (Samsung)", "webOS (LG)", "VIDAA (Hisense)", "Roku").other(),
				multi("features", "Features", "Built-in satellite receiver", "Wi-Fi", "Bluetooth", "Voice remote", "Wall mount included",
						"Stand included"));

		fieldsOf(sub(electronics, "phone-accessories", "Phone accessories"),
				select("type", "Type", "Charger", "Cable", "Earphones", "Headphones", "Bluetooth speaker", "Power bank", "Phone case",
						"Screen protector", "Smartwatch", "Memory card", "Phone holder").req().filter(),
				select("brand", "Brand", "Apple", "Samsung", "Oraimo", "Anker", "JBL", "Xiaomi", "Huawei", "Baseus", "Sony").filter().other(),
				text("works_with", "Works with").help("e.g. iPhone 13, USB-C phones"),
				number("capacity", "Capacity", "mAh").help("Power banks"),
				select("color", "Color", COLORS).other());

		fieldsOf(sub(home, "beds", "Beds"),
				select("size", "Size", BED_SIZES_WITH_KIDS).req().filter().other(),
				select("material", "Material", "Solid wood", "MDF / chipboard", "Metal", "Upholstered (fabric or leather)").req().filter().other(),
				select("wood", "Wood type", "Zigba", "Wanza", "Tid (cedar)", "Eucalyptus", "Imported wood").other().help("If it's wood."),
				yesNo("mattress", "Mattress included").filter(),
				yesNo("drawers", "Storage drawers"),
				yesNo("headboard", "Headboard"),
				select("color", "Color", FURNITURE_COLORS).other(),
				select("origin", "Made", "Locally", "Imported").filter(),
				select("assembly", "Assembly", "Comes assembled", "Needs assembly", "Seller assembles at home"));

		fieldsOf(sub(home, "mattresses", "Mattresses"),
				select("size", "Size", BED_SIZES).req().filter().other(),
				number("thickness", "Thickness", "cm"),
				select("type", "Type", "Foam", "Spring", "Orthopedic", "Pillow top").filter(),
				select("firmness", "Firmness", "Soft", "Medium", "Firm").filter(),
				text("brand", "Brand"));

		fieldsOf(sub(home, "tables", "Tables"),
				select("type", "Type", "Dining table", "Coffee table", "Office desk", "Study desk", "Side table", "TV stand", "Dressing table",
						"Plastic table", "Folding table").req().filter().other(),
				select("material", "Material", "Solid wood", "MDF / chipboard", "Glass top", "Metal", "Plastic", "Marble top").filter().other(),
				select("shape", "Shape", "Rectangle", "Round", "Square", "Oval").filter(),
				number("seats", "Seats", "people"),
				yesNo("chairs", "Chairs included").filter(),
				number("chairs_count", "Number of chairs", "chairs"),
				number("length", "Length", "cm"),
				number("width", "Width", "cm"),
				number("height", "Height", "cm"),
				yesNo("foldable", "Foldable"),
				select("color", "Color", FURNITURE_COLORS).other(),
				select("origin", "Made", "Locally", "Imported").filter(),
				select("assembly", "Assembly", "Comes assembled", "Needs assembly", "Seller assembles at home"));

		fieldsOf(sub(home, "sofas", "Sofas"),
				select("type", "Type", "1-seater (armchair)", "2-seater", "3-seater", "L-shape (corner)", "Sofa set (3+2+1)", "Sofa set (3+1+1)",
						"Sofa bed", "Recliner").req().filter().other(),
				select("material", "Cover", "Fabric", "Leather", "Faux leather", "Velvet", "Suede").filter().other(),
				number("seats", "Seats", "people"),
				select("frame", "Frame", "Wood", "Metal"),
				yesNo("cushions", "Cushions included"),
				select("color", "Color", FURNITURE_COLORS).other().filter(),
				select("origin", "Made", "Locally", "Imported").filter());

		fieldsOf(sub(home, "chairs", "Chairs"),
				select("type", "Type", "Dining chair", "Office chair", "Gaming chair", "Plastic chair", "Bar stool", "Armchair", "Folding chair",
						"Kids chair").req().filter().other(),
				select("material", "Material", "Wood", "Metal", "Plastic", "Fabric", "Leather", "Mesh").filter().other(),
				number("quantity", "How many", "pieces").help("Chairs in this listing."),
				yesNo("adjustable", "Adjustable height"),
				yesNo("armrests", "Armrests"),
				select("color", "Color", FURNITURE_COLORS).other());

		fieldsOf(sub(home, "wardrobes-cabinets", "Wardrobes & cabinets"),
				select("type", "Type", "Wardrobe", "Kitchen cabinet", "Bookshelf", "Shoe rack", "Chest of drawers", "TV cabinet", "Display cabinet")
						.req().filter().other(),
				select("material", "Material", "Solid wood", "MDF / chipboard", "Metal", "Plastic", "Glass").filter().other(),
				number("doors", "Doors", null),
				number("drawers", "Drawers", null),
				yesNo("mirror", "Mirror"),
				number("height", "Height", "cm"),
				number("width", "Width", "cm"),
				number("depth", "Depth", "cm"),
				select("color", "Color", FURNITURE_COLORS).other(),
				select("origin", "Made", "Locally", "Imported").filter(),
				select("assembly", "Assembly", "Comes assembled", "Needs assembly", "Seller assembles at home"));

		fieldsOf(sub(fashion, "clothing", "Clothing"),
				select("for", "For", "Men", "Women", "Boys", "Girls", "Unisex", "Baby").req().filter(),
				select("type", "Type", "Shirt", "T-shirt", "Dress", "Habesha kemis", "Netela / gabi", "Suit", "Jacket", "Coat", "Sweater",
						"Trousers", "Jeans", "Shorts", "Skirt", "Sportswear", "Traditional clothes").req().filter().other(),
				select("size", "Size", "XS", "S", "M", "L", "XL", "XXL", "3XL", "One size").filter().other()
						.help("Kids: type the age, e.g. 4-5 years."),
				select("color", "Color", COLORS).filter().other(),
				select("material", "Material", "Cotton", "Shemma (Habesha cotton)", "Polyester", "Denim", "Wool", "Silk", "Linen", "Leather").other(),
				text("brand", "Brand"));

		fieldsOf(sub(fashion, "shoes", "Shoes"),
				select("for", "For", "Men", "Women", "Boys", "Girls", "Unisex").req().filter(),
				select("type", "Type", "Sneakers", "Formal shoes", "Sandals", "Boots", "Heels", "Flats", "Slippers", "Sports shoes").req().filter().other(),
				select("size", "Size (EU)", IntStream.rangeClosed(20, 47).mapToObj(String::valueOf).toArray(String[]::new)).req().filter(),
				select("brand", "Brand", "Nike", "Adidas", "Puma", "New Balance", "Converse", "Vans", "Skechers", "Clarks", "Local brand").filter().other(),
				select("material", "Material", "Leather", "Synthetic", "Canvas", "Suede", "Rubber").other(),
				select("color", "Color", COLORS).filter().other());
	}

	static final String[] COLORS = { "Black", "White", "Silver", "Gray", "Gold", "Blue", "Green", "Red", "Pink", "Purple", "Brown",
			"Yellow", "Orange" };
	static final String[] FURNITURE_COLORS = { "Natural wood", "Brown", "Dark brown", "White", "Black", "Gray", "Beige", "Blue", "Green",
			"Red" };
	static final String[] BED_SIZES = { "Single (90 × 190 cm)", "3.5 ft (105 × 190 cm)", "4 ft (120 × 190 cm)",
			"Double 4.5 ft (135 × 190 cm)", "Queen 5 ft (150 × 200 cm)", "King 6 ft (180 × 200 cm)" };
	static final String[] BED_SIZES_WITH_KIDS = concat(BED_SIZES, "Bunk bed", "Baby cot");
	static final String[] PHONE_BRANDS = { "Samsung", "Apple", "Tecno", "Infinix", "itel", "Xiaomi", "Oppo", "Vivo", "Realme", "Huawei",
			"Honor", "Nokia", "Google", "OnePlus", "Motorola" };
	static final String[] PHONE_CHIPS = { "Apple A11 Bionic", "Apple A12 Bionic", "Apple A13 Bionic", "Apple A14 Bionic",
			"Apple A15 Bionic", "Apple A16 Bionic", "Apple A17 Pro", "Apple A18", "Apple A18 Pro", "Snapdragon 4 Gen 2",
			"Snapdragon 6 Gen 1", "Snapdragon 7 Gen 3", "Snapdragon 8 Gen 1", "Snapdragon 8 Gen 2", "Snapdragon 8 Gen 3",
			"Snapdragon 8 Elite", "MediaTek Helio G36", "MediaTek Helio G85", "MediaTek Helio G88", "MediaTek Helio G91",
			"MediaTek Helio G96", "MediaTek Helio G99", "MediaTek Dimensity 6080", "MediaTek Dimensity 6100+", "MediaTek Dimensity 7020",
			"MediaTek Dimensity 7050", "MediaTek Dimensity 8200", "MediaTek Dimensity 9300", "Samsung Exynos 850", "Samsung Exynos 1280",
			"Samsung Exynos 1380", "Samsung Exynos 2200", "Samsung Exynos 2400", "Unisoc T606", "Unisoc T612", "Unisoc T616",
			"Google Tensor G2", "Google Tensor G3", "Huawei Kirin 9000S" };
	static final String[] LAPTOP_BRANDS = { "HP", "Dell", "Lenovo", "Apple", "Asus", "Acer", "Microsoft", "MSI", "Samsung", "Huawei",
			"Toshiba / Dynabook", "Fujitsu" };
	static final String[] PROCESSORS = { "Intel Celeron", "Intel Pentium", "Intel Core i3", "Intel Core i5", "Intel Core i7",
			"Intel Core i9", "Intel Core Ultra 5", "Intel Core Ultra 7", "Intel Core Ultra 9", "AMD Ryzen 3", "AMD Ryzen 5", "AMD Ryzen 7",
			"AMD Ryzen 9", "Apple M1", "Apple M1 Pro", "Apple M1 Max", "Apple M2", "Apple M2 Pro", "Apple M2 Max", "Apple M3",
			"Apple M3 Pro", "Apple M3 Max", "Apple M4", "Apple M4 Pro", "Apple M4 Max", "Snapdragon X Elite", "Snapdragon X Plus" };
	static final String[] GRAPHICS = { "Integrated (Intel / AMD)", "Apple GPU", "NVIDIA GeForce MX", "NVIDIA GTX 1650",
			"NVIDIA RTX 3050", "NVIDIA RTX 3060", "NVIDIA RTX 4050", "NVIDIA RTX 4060", "NVIDIA RTX 4070", "AMD Radeon (dedicated)" };

	private static Map<String, List<String>> phoneModels() {
		Map<String, List<String>> m = new LinkedHashMap<>();
		m.put("Samsung", prefix("Galaxy ", "A05", "A05s", "A06", "A14", "A15", "A16", "A24", "A25", "A26", "A34", "A35", "A36", "A54", "A55",
				"A56", "M14", "M15", "M34", "S21", "S21 Ultra", "S22", "S22 Ultra", "S23", "S23 Ultra", "S24", "S24 Ultra", "S25",
				"S25 Ultra", "Note 20", "Note 20 Ultra", "Z Flip5", "Z Flip6", "Z Fold5", "Z Fold6"));
		m.put("Apple", prefix("iPhone ", "7", "7 Plus", "8", "8 Plus", "X", "XR", "XS", "XS Max", "11", "11 Pro", "11 Pro Max", "SE (2020)",
				"12 mini", "12", "12 Pro", "12 Pro Max", "13 mini", "13", "13 Pro", "13 Pro Max", "SE (2022)", "14", "14 Plus", "14 Pro",
				"14 Pro Max", "15", "15 Plus", "15 Pro", "15 Pro Max", "16", "16 Plus", "16 Pro", "16 Pro Max", "16e", "17", "17 Pro",
				"17 Pro Max", "Air"));
		m.put("Tecno", List.of("Spark 10", "Spark 10 Pro", "Spark 20", "Spark 20 Pro", "Spark 30", "Spark 30 Pro", "Camon 20", "Camon 20 Pro",
				"Camon 30", "Camon 30 Pro", "Pova 5", "Pova 6", "Pop 8", "Pop 9", "Phantom X2", "Phantom V Fold"));
		m.put("Infinix", List.of("Smart 7", "Smart 8", "Smart 9", "Hot 30", "Hot 40", "Hot 40 Pro", "Hot 50", "Hot 50 Pro", "Note 30",
				"Note 40", "Note 40 Pro", "Zero 30", "GT 20 Pro"));
		m.put("itel", List.of("A50", "A60", "A70", "P40", "P55", "S23", "S24"));
		m.put("Xiaomi", List.of("Redmi A3", "Redmi 12", "Redmi 13", "Redmi 13C", "Redmi 14C", "Redmi Note 12", "Redmi Note 13",
				"Redmi Note 13 Pro", "Redmi Note 14", "Redmi Note 14 Pro", "Poco X6", "Poco F6", "Xiaomi 13T", "Xiaomi 14", "Xiaomi 14T"));
		m.put("Oppo", List.of("A18", "A38", "A58", "A78", "A79", "Reno 10", "Reno 11", "Reno 12", "Find X7"));
		m.put("Vivo", List.of("Y03", "Y17s", "Y27", "Y36", "V29", "V30"));
		m.put("Realme", List.of("C51", "C53", "C55", "C65", "11", "12"));
		m.put("Huawei", List.of("Y9 Prime", "Nova Y70", "Nova Y90", "Nova 11", "Nova 12", "P30", "P40", "P60", "Mate 60"));
		m.put("Honor", List.of("X6", "X7", "X8", "X9", "90", "Magic6"));
		m.put("Nokia", List.of("105", "106", "110", "C12", "C22", "C32", "G21", "G22"));
		m.put("Google", prefix("Pixel ", "6", "6 Pro", "7", "7 Pro", "8", "8 Pro", "9", "9 Pro"));
		m.put("OnePlus", List.of("Nord CE 3", "Nord 3", "11", "12"));
		m.put("Motorola", List.of("Moto G54", "Moto G84", "Edge 40"));
		return m;
	}

	private static Map<String, List<String>> laptopSeries() {
		Map<String, List<String>> m = new LinkedHashMap<>();
		m.put("HP", List.of("EliteBook", "ProBook", "Pavilion", "Envy", "Spectre", "Victus", "Omen", "ZBook", "HP 14 / 15"));
		m.put("Dell", List.of("Latitude", "Inspiron", "Vostro", "XPS", "Precision", "Alienware", "G series"));
		m.put("Lenovo", List.of("ThinkPad T", "ThinkPad X1", "ThinkPad E", "ThinkPad L", "IdeaPad", "ThinkBook", "Yoga", "Legion", "LOQ"));
		m.put("Apple", List.of("MacBook Air", "MacBook Pro 13\"", "MacBook Pro 14\"", "MacBook Pro 16\""));
		m.put("Asus", List.of("VivoBook", "ZenBook", "ExpertBook", "ROG", "TUF Gaming"));
		m.put("Acer", List.of("Aspire", "Swift", "Extensa", "TravelMate", "Nitro", "Predator"));
		m.put("Microsoft", List.of("Surface Laptop", "Surface Pro", "Surface Book"));
		m.put("MSI", List.of("Modern", "Prestige", "Katana", "Cyborg", "Raider", "Stealth"));
		m.put("Samsung", List.of("Galaxy Book"));
		m.put("Huawei", List.of("MateBook D", "MateBook X"));
		m.put("Toshiba / Dynabook", List.of("Satellite", "Tecra", "Portégé"));
		return m;
	}

	// ---------- helpers ----------

	private Category main(String slug, String name) {
		return categories.findBySlug(slug).orElseGet(() -> {
			Category c = new Category();
			c.setName(name);
			c.setSlug(slug);
			c.setSortOrder(categories.maxSortOrder() + 1);
			return categories.save(c);
		});
	}

	private Category sub(Category parent, String slug, String name) {
		return categories.findBySlug(slug).orElseGet(() -> {
			Category c = new Category();
			c.setName(name);
			c.setSlug(slug);
			c.setParentId(parent.getId());
			c.setSortOrder(categories.maxSortOrder() + 1);
			return categories.save(c);
		});
	}

	/** Adds the fields only to a category that has none yet (never touches what admins set up). */
	private void fieldsOf(Category c, F... list) {
		if (!fields.findByCategoryIdOrderByPositionAscIdAsc(c.getId()).isEmpty()) {
			return;
		}
		int pos = 1;
		for (F f : list) {
			CategoryField x = new CategoryField();
			x.setCategoryId(c.getId());
			x.setKey(f.key);
			x.setLabel(f.label);
			x.setType(f.type);
			x.setUnit(f.unit);
			x.setOptions(specs.writeOptions(f.options));
			x.setDependsOn(f.dependsOn);
			x.setAllowOther(f.other);
			x.setRequired(f.required);
			x.setFilterable(f.filter);
			x.setHelp(f.help);
			x.setPosition(pos++);
			fields.save(x);
		}
	}

	private static List<String> prefix(String p, String... names) {
		return Arrays.stream(names).map(n -> p + n).toList();
	}

	private static String[] concat(String[] a, String... b) {
		List<String> l = new ArrayList<>(Arrays.asList(a));
		l.addAll(Arrays.asList(b));
		return l.toArray(String[]::new);
	}

	static F select(String key, String label, String... options) {
		return new F(key, label, Type.SELECT, List.of(options));
	}

	static F multi(String key, String label, String... options) {
		return new F(key, label, Type.MULTI, List.of(options));
	}

	static F dependent(String key, String label, String dependsOn, Map<String, List<String>> options) {
		F f = new F(key, label, Type.SELECT, options);
		f.dependsOn = dependsOn;
		return f;
	}

	static F number(String key, String label, String unit) {
		F f = new F(key, label, Type.NUMBER, null);
		f.unit = unit;
		return f;
	}

	static F text(String key, String label) {
		return new F(key, label, Type.TEXT, null);
	}

	static F yesNo(String key, String label) {
		return new F(key, label, Type.YES_NO, null);
	}

	static final class F {
		final String key;
		final String label;
		final Type type;
		final Object options;
		String unit;
		String dependsOn;
		String help;
		boolean other;
		boolean required;
		boolean filter;

		F(String key, String label, Type type, Object options) {
			this.key = key;
			this.label = label;
			this.type = type;
			this.options = options;
		}

		F req() {
			required = true;
			return this;
		}

		F filter() {
			filter = true;
			return this;
		}

		F other() {
			other = true;
			return this;
		}

		F help(String text) {
			help = text;
			return this;
		}
	}
}
