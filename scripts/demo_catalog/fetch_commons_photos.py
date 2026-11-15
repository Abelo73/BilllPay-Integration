#!/usr/bin/env python3
"""Replace demo placeholder photos with openly licensed photos from Wikimedia Commons.

Only files whose licence is on ALLOWED_LICENCES are used. Every photo used gets a credit row in
frontend/public/demo/CREDITS-commons.md (title, author, licence, source page). A listing with no
suitable Commons photo keeps its placeholder.

How it works
  - For each new demo listing (the ones the expansion script added), take its base item name
    ("Lenovo ThinkPad T14" from "Lenovo ThinkPad T14 - Silver").
  - Search Commons for the base name. Accept a hit only if its title shares a distinctive word
    with the base name. If nothing matches, search the category keyword and accept the first
    allowed hit.
  - Download the 480 px thumbnail, centre-crop it to a square and save it as the listing's photo.
  - Variants of the same base item reuse the base photo (same file, different name and price).

Usage (repo root):
  python3 scripts/demo_catalog/fetch_commons_photos.py
Needs internet access. Re-running only fetches what is not cached in the scratch folder.
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import expand_demo_catalog as expand  # noqa: E402  (same folder: slugify, paths)

ROOT_DIR = expand.ROOT

API = "https://commons.wikimedia.org/w/api.php"
UA = "SodoGebeyaDemoSeed/1.0 (development seed data; no personal data)"
SCRATCH = Path("/tmp/claude-1000/-home-abel-adisu-Desktop-blink/1ffa4010-b1ad-483f-955d-c23d081125ea/scratchpad/commons")
CREDITS = expand.PHOTO_DIR / "CREDITS-commons.md"
ALLOWED_LICENCES = {
    "CC0", "Public domain", "PD-self", "CC BY 4.0", "CC BY 3.0", "CC BY 2.0",
    "CC BY-SA 4.0", "CC BY-SA 3.0", "CC BY-SA 2.0",
}
CATEGORY_KEYWORD = {
    "laptops": "laptop", "desktop-computers": "desktop computer", "tablets": "tablet computer",
    "mobile-phones": "smartphone", "phone-accessories": "phone accessory", "tvs": "television",
    "kitchen-appliances": "kitchen appliance", "tables": "wooden table", "sofas": "sofa",
    "beds": "bed frame", "mattresses": "mattress", "wardrobes-cabinets": "wardrobe",
    "chairs": "chair", "clothing": "clothing", "shoes": "shoes", "beauty-health": "cosmetics",
    "baby-kids": "baby toys", "sports-outdoors": "sports equipment", "books-stationery": "stationery",
    "vehicles": "motorcycle", "pantry": "spices", "coffee-tea": "coffee beans",
    "tools-construction": "power tools", "commercial-equipment": "commercial kitchen",
    "animals-pets": "pet food", "business-industry": "office equipment",
}
STOP = {"the", "and", "with", "for", "set", "pack", "inch", "cm", "kg", "ml", "lite", "new", "used", "pro",
        "pieces", "piece", "bag", "pair", "small", "large", "medium", "black", "white"}


def api(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "origin": "*"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def search(query):
    data = api({
        "action": "query", "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 10,
        "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size", "iiurlwidth": 480,
    })
    pages = list((data.get("query") or {}).get("pages", {}).values())
    return sorted(pages, key=lambda p: p.get("index", 0))


def meta(info, key):
    value = info.get("extmetadata", {}).get(key, {}).get("value", "")
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def acceptable(page, need_word=None):
    info = (page.get("imageinfo") or [None])[0]
    if not info or info.get("mime") not in ("image/jpeg", "image/png"):
        return None
    if info.get("width", 0) < 300 or info.get("height", 0) < 200:
        return None
    licence = meta(info, "LicenseShortName")
    if licence not in ALLOWED_LICENCES:
        return None
    title = page.get("title", "").replace("File:", "")
    if need_word and need_word not in title.lower():
        return None
    return info


def distinctive_word(base):
    words = [w for w in re.split(r"[^a-z0-9]+", base.lower()) if len(w) > 3 and w not in STOP and not w.isdigit()]
    return words[0] if words else None


def find_photo(base, category):
    cache = SCRATCH / f"{expand.slugify(base)}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    result = None
    word = distinctive_word(base)
    for query, need in ((base, word), (CATEGORY_KEYWORD.get(category, category), None)):
        for page in search(query):
            info = acceptable(page, need)
            if info:
                result = {
                    "url": info["thumburl"], "title": page["title"].replace("File:", ""),
                    "author": meta(info, "Artist") or "Unknown", "licence": meta(info, "LicenseShortName"),
                    "source": info["descriptionurl"], "query": query,
                }
                break
        time.sleep(0.4)
        if result:
            break
    SCRATCH.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result))
    return result


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def to_square_jpeg(src, dest, side=480):
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        ImageOps.fit(im, (side, side), Image.LANCZOS).save(dest, "JPEG", quality=72, optimize=True)


def main():
    catalog = json.loads(expand.CATALOG.read_text(encoding="utf-8"))
    # Listings already in git are kept as they are (their photos are the Commons ones from before).
    import subprocess
    rel = expand.CATALOG.relative_to(ROOT_DIR).as_posix()
    before = json.loads(subprocess.run(["git", "-C", str(ROOT_DIR), "show", f"HEAD:{rel}"],
                                       capture_output=True, text=True, check=True).stdout)
    old = {p["slug"] for p in before["products"]}
    new_listings = [p for p in catalog["products"] if p["slug"] not in old]

    bases = {}
    for p in new_listings:
        base = p["name"].split(" - ")[0]
        bases.setdefault((base, p["category"]), []).append(p["slug"])

    print(f"{len(new_listings)} new listings, {len(bases)} base items to look up")
    found, missing, rows = 0, [], []
    for (base, category), slugs in bases.items():
        try:
            photo = find_photo(base, category)
        except Exception as e:  # network hiccup: keep placeholders, report at the end
            print(f"  ! {base}: {e}")
            photo = None
        if not photo:
            missing.append(base)
            continue
        base_file = SCRATCH / f"{expand.slugify(base)}.src"
        if not base_file.exists():
            try:
                download(photo["url"], base_file)
            except Exception as e:
                print(f"  ! download {base}: {e}")
                missing.append(base)
                continue
        for slug in slugs:
            to_square_jpeg(base_file, expand.PHOTO_DIR / f"{slug}.jpg")
        found += 1
        rows.append((base, category, photo))
        print(f"  ok  {base:40s} <- {photo['title'][:60]} ({photo['licence']})")

    CREDITS.write_text(credit_table(rows), encoding="utf-8")
    print(f"real photos for {found} base items; {len(missing)} base items keep their placeholders")
    if missing:
        print("placeholders kept for:", "; ".join(missing[:20]), "..." if len(missing) > 20 else "")


def credit_table(rows):
    lines = [
        "# Photo credits from Wikimedia Commons",
        "",
        "Generated by `scripts/demo_catalog/fetch_commons_photos.py`. Each photo is used under the licence",
        "shown. Follow the source link for full terms. Listings of the same base item share the photo.",
        "",
        "| Base item | Category | Title on Commons | Author | Licence | Source |",
        "|---|---|---|---|---|---|",
    ]
    for base, category, p in sorted(rows):
        author = re.sub(r"\s+", " ", p["author"]).replace("|", "/")[:120]
        lines.append(f"| {base} | {category} | {p['title']} | {author} | {p['licence']} | {p['source']} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
