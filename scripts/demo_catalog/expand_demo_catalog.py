#!/usr/bin/env python3
"""Expand the Sodo Gebeya demo catalog so every goods category has at least 30 listings, each with a photo.

What it does
  1. Reads backend/src/main/resources/demo/catalog.json (the file DemoCatalogService loads).
  2. Adds the missing categories and 4 new shops.
  3. Tops up every goods category to MIN_PER_CATEGORY listings. New listings are built from the
     base items in BASE below, plus colour / size / pack variants, so the names stay realistic.
  4. Writes a placeholder JPEG per new listing to frontend/public/demo/<slug>.jpg. The loader reads
     "/demo/<slug>.jpg", so the file name must be the slug.
  5. Checks the result (counts, unique slugs, known shops and categories, every photo present).

Placeholder photos are generated locally. They are NOT product photos and are labelled as such on
the image. Real photos (Wikimedia Commons, with credits in frontend/public/demo/CREDITS.md) can
replace them file by file later; the slug stays the same.

Usage (from the repo root):
  python3 scripts/demo_catalog/expand_demo_catalog.py            # write files, then check
  python3 scripts/demo_catalog/expand_demo_catalog.py --check    # check only, no writes

Prices are whole ETB integers, as in the existing catalog. They are demo prices, not market research.
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "backend/src/main/resources/demo/catalog.json"
PHOTO_DIR = ROOT / "frontend/public/demo"

MIN_PER_CATEGORY = 30
PREFIX = "demo-"
VALID_CONDITIONS = {"NEW", "USED", "LIKE_NEW"}

# Categories that exist in the V2 seed migration, used as parents.
# (slug, name, parent). Parents must come before children in the JSON.
NEW_CATEGORIES = [
    ("electronics", "Electronics", None),
    ("home-living", "Home & Living", None),
    ("fashion", "Fashion", None),
    ("pantry", "Pantry", None),
    ("coffee-tea", "Coffee & Tea", None),
    ("laptops", "Laptops", "electronics"),
    ("desktop-computers", "Desktop computers", "electronics"),
    ("tablets", "Tablets", "electronics"),
    ("mobile-phones", "Mobile phones", "electronics"),
    ("phone-accessories", "Phone accessories", "electronics"),
    ("tvs", "TVs", "electronics"),
    ("tables", "Tables & desks", "home-living"),
    ("sofas", "Sofas", "home-living"),
    ("beds", "Beds", "home-living"),
    ("mattresses", "Mattresses", "home-living"),
    ("wardrobes-cabinets", "Wardrobes & cabinets", "home-living"),
    ("chairs", "Chairs", "home-living"),
    ("clothing", "Clothing", "fashion"),
    ("shoes", "Shoes", "fashion"),
    ("tools-construction", "Tools & construction", None),
    ("commercial-equipment", "Commercial equipment", None),
    ("animals-pets", "Animals & pets", None),
    ("business-industry", "Business & industry", None),
]

NEW_SHOPS = [
    {"slug": "sodo-motors", "name": "Sodo Motors", "kind": "SHOP", "area": "Arada",
     "phone": "+251911000201", "address": "Arada, near the main road",
     "about": "Motorcycles, bicycles, scooters, car parts and batteries. Used vehicles checked before sale."},
    {"slug": "sodo-tools-hardware", "name": "Sodo Tools & Hardware", "kind": "SHOP", "area": "Bus station",
     "phone": "+251911000202", "address": "Behind the bus station",
     "about": "Power tools, hand tools, building materials and commercial kitchen and shop equipment."},
    {"slug": "pet-corner-sodo", "name": "Pet Corner Sodo", "kind": "SHOP", "area": "Merkato area",
     "phone": "+251911000203", "address": "Merkato, near the pharmacy",
     "about": "Pet food, accessories, cages and aquarium supplies."},
    {"slug": "office-supply-sodo", "name": "Office Supply Sodo", "kind": "SHOP", "area": "University area",
     "phone": "+251911000204", "address": "University road",
     "about": "Office paper, printers, shop tills, safes and filing."},
]

# Base items per goods category: (name, price ETB, condition). Shop per category in SHOP_FOR.
BASE = {
    "laptops": [
        ("HP ProBook 450 G9 15.6 inch", 65000, "NEW"), ("Lenovo ThinkPad T14", 72000, "USED"),
        ("Dell Latitude 5420", 58000, "USED"), ("Acer Aspire 5 15.6 inch", 48000, "NEW"),
        ("ASUS VivoBook 15", 42000, "NEW"), ("Lenovo IdeaPad Slim 3", 45000, "NEW"),
        ("HP 255 G8 14 inch", 39000, "NEW"), ("Apple MacBook Air M1 13 inch 8/256", 105000, "LIKE_NEW"),
    ],
    "desktop-computers": [
        ("Dell OptiPlex 7070 tower", 45000, "USED"), ("HP ProDesk 400 G6 small form factor", 38000, "USED"),
        ("Lenovo ThinkCentre M720q", 34000, "USED"), ("Office PC Intel i5 8 GB", 42000, "NEW"),
        ("Gaming PC RTX 3060 build", 120000, "NEW"), ("Dell Inspiron 24 all-in-one", 55000, "NEW"),
        ("Mini PC Intel N100", 18500, "NEW"),
    ],
    "tablets": [
        ("Samsung Galaxy Tab A9 64 GB", 19500, "NEW"), ("Lenovo Tab M10 Plus", 21000, "NEW"),
        ("Apple iPad 9th gen 64 GB", 36000, "USED"), ("Huawei MatePad SE", 16500, "NEW"),
        ("Xiaomi Pad 6 128 GB", 33000, "NEW"), ("Amazon Fire HD 10", 17800, "NEW"),
    ],
    "mobile-phones": [
        ("Samsung Galaxy A15 128 GB", 13500, "NEW"), ("Infinix Hot 40i", 9800, "NEW"),
        ("Tecno Spark 20", 8900, "NEW"), ("iPhone 11 64 GB", 15000, "USED"),
        ("Xiaomi Redmi 13", 11200, "NEW"), ("Itel A70", 4500, "NEW"),
        ("Samsung Galaxy A54 5G 256 GB", 27500, "NEW"),
    ],
    "phone-accessories": [
        ("USB-C fast charger 20 W", 650, "NEW"), ("Tempered glass screen protector", 150, "NEW"),
        ("Silicone phone case", 250, "NEW"), ("Wireless earbuds", 1200, "NEW"),
        ("Power bank 10000 mAh", 1500, "NEW"), ("Mini Bluetooth speaker", 1100, "NEW"),
        ("Adjustable phone stand", 300, "NEW"),
    ],
    "tvs": [
        ("Hisense 43 inch smart LED TV", 32000, "NEW"), ("Samsung 50 inch Crystal UHD", 48000, "NEW"),
        ("TCL 32 inch HD LED TV", 17500, "NEW"), ("LG 55 inch 4K TV", 56000, "NEW"),
        ("Android TV box 4K", 3200, "NEW"), ("Sony Bravia 43 inch", 45000, "USED"),
    ],
    "kitchen-appliances": [
        ("Electric kettle 1.7 L", 1400, "NEW"), ("Rice cooker 1.8 L", 2500, "NEW"),
        ("Blender 1.5 L", 2200, "NEW"), ("Microwave 20 L", 6800, "NEW"),
        ("Gas stove 2 burners", 3500, "NEW"), ("Electric pressure cooker 6 L", 4800, "NEW"),
        ("Two-slice toaster", 1600, "NEW"), ("Electric coffee roaster", 2900, "NEW"),
        ("Water dispenser hot and cold", 7500, "NEW"), ("Refrigerator 150 L", 28000, "NEW"),
    ],
    "tables": [
        ("Solid wood dining table 4 seater", 14500, "NEW"), ("Round coffee table", 4200, "NEW"),
        ("Study desk with drawer", 6800, "NEW"), ("Office desk 120 cm", 9500, "NEW"),
        ("Side table set of 2", 3200, "NEW"), ("Folding table 6 ft", 3800, "NEW"),
        ("TV stand 150 cm", 5400, "NEW"),
    ],
    "sofas": [
        ("3 seater fabric sofa", 24500, "NEW"), ("L-shaped sofa", 42000, "NEW"),
        ("Leather recliner sofa", 38000, "NEW"), ("2 seater sofa bed", 27000, "NEW"),
        ("Wooden frame sofa set 6 seater", 65000, "USED"), ("Grey sectional sofa", 52000, "NEW"),
    ],
    "beds": [
        ("Double bed 140 x 190 with headboard", 22000, "NEW"), ("Single bed frame 90 x 190", 12000, "NEW"),
        ("Queen bed with storage", 35000, "NEW"), ("Solid pine bunk bed", 38000, "NEW"),
        ("King bed frame 180 x 200", 45000, "NEW"), ("Divan bed base", 18000, "NEW"),
    ],
    "mattresses": [
        ("Foam mattress double 10 cm", 14000, "NEW"), ("Spring mattress queen 20 cm", 28000, "NEW"),
        ("Memory foam mattress king", 42000, "NEW"), ("Orthopedic mattress single 15 cm", 18000, "NEW"),
        ("Latex mattress double", 36000, "NEW"), ("Foam mattress single 8 cm", 9500, "NEW"),
    ],
    "wardrobes-cabinets": [
        ("3 door wardrobe with mirror", 26000, "NEW"), ("Kitchen wall cabinet", 12500, "NEW"),
        ("Shoe cabinet 5 tier", 4800, "NEW"), ("Glass display cabinet", 11000, "NEW"),
        ("2 door wardrobe", 16500, "NEW"), ("Bedside cabinet", 3900, "NEW"),
    ],
    "chairs": [
        ("Office chair with armrests", 7800, "NEW"), ("Dining chair set of 4", 9800, "NEW"),
        ("Velvet accent armchair", 8500, "NEW"), ("Plastic stackable chair", 900, "NEW"),
        ("Gaming chair", 12500, "NEW"), ("Traditional wooden chair", 3200, "NEW"),
    ],
    "clothing": [
        ("Habesha kemis, cotton", 3500, "NEW"), ("Men's polo shirt", 1200, "NEW"),
        ("Slim fit jeans", 1800, "NEW"), ("Traditional netela shawl", 1500, "NEW"),
        ("Hoodie pullover", 1600, "NEW"), ("Floral summer dress", 1400, "NEW"),
        ("Kids school uniform set", 1100, "NEW"), ("Men's 2 piece suit", 8500, "NEW"),
    ],
    "shoes": [
        ("Unisex running shoes", 2800, "NEW"), ("Men's leather loafers", 3600, "NEW"),
        ("Women's heels 8 cm", 2200, "NEW"), ("Black school shoes", 1300, "NEW"),
        ("Women's flat sandals", 900, "NEW"), ("Men's sport slides", 700, "NEW"),
        ("Leather ankle boots", 4200, "NEW"),
    ],
    "beauty-health": [
        ("Shea butter body cream 250 ml", 450, "NEW"), ("Hair relaxer kit", 650, "NEW"),
        ("Gentle face wash 150 ml", 380, "NEW"), ("Electric hair clipper", 2400, "NEW"),
        ("Sunscreen SPF50 60 ml", 620, "NEW"), ("Perfume 100 ml", 1800, "NEW"),
        ("Vitamin C serum 30 ml", 950, "NEW"), ("Electric toothbrush", 2100, "NEW"),
    ],
    "baby-kids": [
        ("Lightweight baby stroller", 6500, "NEW"), ("Cot with mattress", 9800, "NEW"),
        ("Diapers pack of 60", 1100, "NEW"), ("Baby monitor camera", 4200, "NEW"),
        ("Kids bicycle 16 inch", 5200, "NEW"), ("Building blocks 100 pieces", 1500, "NEW"),
        ("Baby bottle set", 800, "NEW"),
    ],
    "sports-outdoors": [
        ("Football size 5", 900, "NEW"), ("Yoga mat 6 mm", 1100, "NEW"),
        ("Adjustable dumbbell set 20 kg", 6800, "NEW"), ("Camping tent 4 person", 7200, "NEW"),
        ("Mountain bicycle 27.5 inch", 18500, "NEW"), ("Official basketball", 1300, "NEW"),
        ("Manual treadmill", 16000, "USED"),
    ],
    "books-stationery": [
        ("Amharic dictionary", 350, "NEW"), ("A4 notebook 200 pages", 120, "NEW"),
        ("Ballpoint pens pack of 10", 150, "NEW"), ("Scientific calculator", 900, "NEW"),
        ("Grade 12 mathematics textbook", 400, "NEW"), ("School backpack 25 L", 1100, "NEW"),
        ("Colour pencils set of 48", 850, "NEW"),
    ],
    "vehicles": [
        ("Bajaj Boxer motorcycle 2024", 185000, "USED"), ("Honda CG 125 used 2019", 135000, "USED"),
        ("Toyota Corolla 2010 used", 980000, "USED"), ("Electric scooter 1000 W", 42000, "NEW"),
        ("City bicycle 26 inch", 8500, "NEW"), ("Car battery 70 Ah", 6500, "NEW"),
        ("Full face motorcycle helmet", 2500, "NEW"), ("Tyre 165/70 R13", 2200, "NEW"),
    ],
    "pantry": [
        ("Berbere spice 500 g", 380, "NEW"), ("Niter kibbeh 500 g", 900, "NEW"),
        ("Pasta 500 g", 120, "NEW"), ("Red lentils 1 kg", 260, "NEW"),
        ("Teff flour 1 kg", 280, "NEW"), ("Sugar 1 kg", 110, "NEW"),
        ("Cooking oil 1 L", 320, "NEW"), ("Dried chickpeas 1 kg", 240, "NEW"),
        ("Sesame seeds 500 g", 210, "NEW"),
    ],
    "coffee-tea": [
        ("Sidamo coffee beans 500 g", 590, "NEW"), ("Yirgacheffe ground coffee 250 g", 380, "NEW"),
        ("Green tea leaves 100 g", 180, "NEW"), ("Ethiopian tea 250 g", 150, "NEW"),
        ("Clay jebena coffee pot", 1450, "NEW"), ("Coffee roasting pan", 650, "NEW"),
        ("Cup and saucer set of 6", 900, "NEW"), ("Coffee filter bags pack of 20", 120, "NEW"),
    ],
    "tools-construction": [
        ("Cordless drill 18 V", 5200, "NEW"), ("Angle grinder 115 mm", 3400, "NEW"),
        ("Hand tool set 120 pieces", 2800, "NEW"), ("Cement 50 kg bag", 1050, "NEW"),
        ("Interior paint 4 L", 1900, "NEW"), ("Aluminium ladder 3 m", 4600, "NEW"),
        ("Steel wheelbarrow", 3800, "NEW"), ("Water pump 1 HP", 6500, "NEW"),
    ],
    "commercial-equipment": [
        ("Commercial espresso machine", 185000, "NEW"), ("Stainless prep table 120 cm", 24000, "NEW"),
        ("Deep fryer 10 L", 16500, "NEW"), ("Industrial sewing machine", 42000, "USED"),
        ("Display fridge 300 L", 68000, "USED"), ("Digital weighing scale 30 kg", 3800, "NEW"),
        ("Commercial gas burner 2 rings", 9500, "NEW"), ("Steel shelving unit 5 tier", 7200, "NEW"),
    ],
    "animals-pets": [
        ("Dog food 15 kg", 2200, "NEW"), ("Cat litter 10 L", 650, "NEW"),
        ("Medium pet carrier", 1500, "NEW"), ("Bird cage", 1800, "NEW"),
        ("Leather dog collar", 350, "NEW"), ("Aquarium 60 L with filter", 5400, "NEW"),
        ("Chicken feed 25 kg", 1100, "NEW"), ("Cat scratching tree", 2100, "NEW"),
        ("Fish food flakes 100 g", 180, "NEW"),
    ],
    "business-industry": [
        ("A4 printer paper 5 reams", 1100, "NEW"), ("Point of sale terminal", 14500, "NEW"),
        ("Wireless barcode scanner", 4200, "NEW"), ("Metal filing cabinet 4 drawer", 6800, "NEW"),
        ("Thermal label printer", 9200, "NEW"), ("Whiteboard 120 x 90 cm", 2400, "NEW"),
        ("Security safe 30 kg", 8800, "NEW"), ("A3 laminating machine", 3600, "NEW"),
    ],
}

# Which shop sells each goods category (existing shop slugs, or one of NEW_SHOPS).
SHOP_FOR = {
    "laptops": "sodo-tech-hub", "desktop-computers": "sodo-tech-hub", "tablets": "sodo-tech-hub",
    "mobile-phones": "wolaita-mobile-center", "phone-accessories": "wolaita-mobile-center",
    "tvs": "bright-appliances", "kitchen-appliances": "bright-appliances",
    "tables": "abebe-furniture", "beds": "abebe-furniture", "wardrobes-cabinets": "abebe-furniture",
    "sofas": "comfort-home", "mattresses": "comfort-home", "chairs": "comfort-home",
    "clothing": "selam-fashion", "shoes": "step-up-shoes",
    "beauty-health": "glow-beauty", "baby-kids": "little-stars", "sports-outdoors": "sodo-sports",
    "books-stationery": "wisdom-books", "vehicles": "sodo-motors",
    "pantry": "damota-coffee", "coffee-tea": "damota-coffee",
    "tools-construction": "sodo-tools-hardware", "commercial-equipment": "sodo-tools-hardware",
    "animals-pets": "pet-corner-sodo", "business-industry": "office-supply-sodo",
}

VARIANTS = ["Black", "Silver", "Blue", "Grey", "White", "Red", "Gold", "Pack of 2", "Pack of 5",
            "Large", "Medium", "Small", "Series B", "2024 model", "Refurbished", "Gift set"]

# Colour per parent group, for the placeholder image.
PALETTE = [(0x05, 0x16, 0x42), (0x0B, 0x5C, 0x3A), (0x7A, 0x3E, 0x12), (0x4A, 0x2C, 0x6E),
           (0x1F, 0x5F, 0x7A), (0x6B, 0x1E, 0x2E), (0x3C, 0x4A, 0x1F), (0x2E, 0x2E, 0x2E)]


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def stock_for(key):
    return 3 + int(hashlib.sha256(key.encode()).hexdigest(), 16) % 18


def price_for(base, index):
    factors = [1.00, 1.03, 0.97, 1.05, 0.95]
    return int(round(base * factors[index % len(factors)] / 10.0) * 10) if base >= 1000 else int(base * factors[index % len(factors)])


def placeholder(slug, title, subtitle, group):
    """A tidy card for a listing that has no real photo yet: gradient, soft circles, category chip."""
    size = 600
    top = PALETTE[group % len(PALETTE)]
    bottom = tuple(max(0, int(c * 0.45)) for c in top)
    img = Image.new("RGB", (size, size), top)
    grad = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        grad.line([(0, y), (size, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((360, -120, 760, 280), fill=(255, 255, 255, 40))
    gd.ellipse((-140, 380, 240, 760), fill=(255, 255, 255, 28))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)
    try:
        big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
        chip = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except OSError:
        big = ImageFont.load_default(size=40)
        chip = ImageFont.load_default(size=20)
        small = ImageFont.load_default(size=18)
    # category chip
    label = subtitle.upper()[:28]
    w = draw.textlength(label, font=chip) + 36
    draw.rounded_rectangle((36, 36, 36 + w, 84), radius=24, fill=(255, 255, 255))
    draw.text((54, 47), label, fill=top, font=chip)
    # title, centred block
    lines = wrap(title, 18)[:4]
    y = 250 - len(lines) * 28
    for line in lines:
        tw = draw.textlength(line, font=big)
        draw.text(((size - tw) / 2, y), line, fill=(255, 255, 255), font=big)
        y += 58
    # footer
    footer = "DEMO PLACEHOLDER - NOT A PRODUCT PHOTO"
    fw = draw.textlength(footer, font=small)
    draw.text(((size - fw) / 2, size - 56), footer, fill=(230, 230, 230), font=small)
    img.save(PHOTO_DIR / f"{slug}.jpg", "JPEG", quality=76, optimize=True)


def wrap(text, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        if len(line) + len(w) + 1 > width and line:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        lines.append(line)
    return lines


def build(catalog, write):
    existing_slugs = {p["slug"] for p in catalog["products"]}
    existing_shops = {s["slug"] for s in catalog["shops"]}
    cat_names = {slug: name for slug, name, _parent in NEW_CATEGORIES}
    cat_slugs = {c["slug"] for c in catalog["categories"]}

    # Categories: add missing ones, parents before children.
    for slug, name, parent in NEW_CATEGORIES:
        if slug not in cat_slugs:
            entry = {"slug": slug, "name": name}
            if parent:
                entry["parent"] = parent
            catalog["categories"].append(entry)
            cat_slugs.add(slug)

    # Shops.
    for shop in NEW_SHOPS:
        if shop["slug"] not in existing_shops:
            catalog["shops"].append(shop)
            existing_shops.add(shop["slug"])

    counts = Counter(p["category"] for p in catalog["products"])
    added = []
    group_index = {}
    for leaf, bases in BASE.items():
        need = max(0, MIN_PER_CATEGORY - counts[leaf])
        group = group_index.setdefault(leaf, len(group_index))
        i = 0
        k = 0
        while i < need:
            base_name, base_price, condition = bases[k % len(bases)]
            cycle = k // len(bases)  # 0 = the base item itself, 1+ = a variant of it
            title = base_name if cycle == 0 else f"{base_name} - {VARIANTS[(cycle - 1) % len(VARIANTS)]}"
            slug = PREFIX + slugify(title)
            n = 2
            while slug in existing_slugs:
                slug = f"{PREFIX}{slugify(title)}-{n}"
                n += 1
            existing_slugs.add(slug)
            product = {
                "slug": slug,
                "category": leaf,
                "shop": SHOP_FOR[leaf],
                "name": title,
                "price": price_for(base_price, k),
                "specs": {},
                "condition": condition,
                "negotiable": condition == "USED",
                "stock": stock_for(slug),
                "featured": counts[leaf] == 0 and k < 2,
                "description": None,
                "photo": title,
            }
            if write:
                placeholder(slug, title, cat_names.get(leaf, leaf.replace("-", " ")), group)
            catalog["products"].append(product)
            added.append(product)
            i += 1
            k += 1
    return added


def check(catalog):
    problems = []
    cats = {c["slug"]: c for c in catalog["categories"]}
    shops = {s["slug"] for s in catalog["shops"]}
    seen = set()
    per = Counter()
    for p in catalog["products"]:
        if p["slug"] in seen:
            problems.append(f"duplicate slug {p['slug']}")
        seen.add(p["slug"])
        if p["category"] not in cats:
            problems.append(f"{p['slug']}: unknown category {p['category']}")
        if p["shop"] not in shops:
            problems.append(f"{p['slug']}: unknown shop {p['shop']}")
        if not isinstance(p["price"], int) or p["price"] <= 0:
            problems.append(f"{p['slug']}: price must be a positive whole ETB integer")
        if p["condition"] not in VALID_CONDITIONS:
            problems.append(f"{p['slug']}: bad condition {p['condition']}")
        if not (PHOTO_DIR / f"{p['slug']}.jpg").exists():
            problems.append(f"{p['slug']}: missing photo")
        per[p["category"]] += 1
    for leaf in BASE:
        if per[leaf] < MIN_PER_CATEGORY:
            problems.append(f"{leaf}: only {per[leaf]} listings, need {MIN_PER_CATEGORY}")
    return problems, per


def main():
    check_only = "--check" in sys.argv
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if not check_only:
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        added = build(catalog, write=True)
        CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"added {len(added)} listings, {len(NEW_CATEGORIES)} categories checked, {len(NEW_SHOPS)} shops checked")
    problems, per = check(catalog)
    for leaf in sorted(BASE):
        print(f"{leaf:24s} {per[leaf]:4d}")
    print(f"total listings: {len(catalog['products'])}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("OK: every goods category has at least", MIN_PER_CATEGORY, "listings, all with photos")


if __name__ == "__main__":
    main()
