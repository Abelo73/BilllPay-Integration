#!/usr/bin/env python3
"""Replace category-level stand-in photos with exact matches, or with a labelled placeholder.

Some demo listings got a generic photo of their category (a laptop for any laptop) rather than their product. This
script searches Wikimedia Commons again for each of those products by name only, with no category fallback. A photo
is used only when its title shares a distinctive word with the product name and its licence allows reuse. Otherwise
the listing gets a labelled placeholder, so no shopper sees the wrong product.

Usage (repo root):  python3 scripts/demo_catalog/fix_photo_matches.py
Re-running is safe: photos that already match exactly are left alone.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import expand_demo_catalog as expand  # noqa: E402
import fetch_commons_photos as fetch  # noqa: E402

STRICT = Path(fetch.SCRATCH) / "strict"
STRICT.mkdir(parents=True, exist_ok=True)


def strict_photo(base):
    """Cached: the first exact-title match, or None."""
    cache = STRICT / f"{expand.slugify(base)}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    result = None
    word = fetch.distinctive_word(base)
    if word:
        for page in fetch.search(base):
            info = fetch.acceptable(page, word)
            if info:
                result = {"url": info["thumburl"], "title": page["title"].replace("File:", ""),
                          "author": fetch.meta(info, "Artist") or "Unknown",
                          "licence": fetch.meta(info, "LicenseShortName"), "source": info["descriptionurl"], "query": base}
                break
    cache.write_text(json.dumps(result))
    return result


def main():
    catalog = json.loads(expand.CATALOG.read_text(encoding="utf-8"))
    # the listings that were added in the expansion; their photos are ours to fix
    import subprocess
    before = json.loads(subprocess.run(["git", "-C", str(expand.ROOT), "show", f"{fetch.BEFORE_REF}:{expand.CATALOG.relative_to(expand.ROOT).as_posix()}"],
                                       capture_output=True, text=True, check=True).stdout)
    old = {p["slug"] for p in before["products"]}
    new = [p for p in catalog["products"] if p["slug"] not in old]

    groups = {}
    for p in new:
        groups.setdefault((p["name"].split(" - ")[0], p["category"]), []).append(p)

    cat_names = {slug: name for slug, name, _ in expand.NEW_CATEGORIES}
    leaf_order = list(expand.BASE.keys())
    matched, placeholders = 0, 0
    rows = []
    placeholder_bases = set()
    for (base, category), items in groups.items():
        photo = strict_photo(base)
        if photo:
            src = STRICT / f"{expand.slugify(base)}.src"
            if not src.exists():
                fetch.download(photo["url"], src)
            for p in items:
                fetch.to_square_jpeg(src, expand.PHOTO_DIR / f"{p['slug']}.jpg")
            matched += 1
            rows.append((base, category, photo))
            print(f"  exact  {base:40s} <- {photo['title'][:60]}")
        else:
            for p in items:
                expand.placeholder(p["slug"], p["name"], cat_names.get(category, category.replace("-", " ")),
                                   leaf_order.index(category) if category in leaf_order else 0)
            placeholders += 1
            placeholder_bases.add(base)
            print(f"  placeholder  {base}")
    # credits: drop the stand-ins that are now placeholders, keep and add the exact matches
    kept = [r for r in fetch.merge_rows(expand.PHOTO_DIR / "CREDITS-commons.md", rows) if r[0] not in placeholder_bases]
    (expand.PHOTO_DIR / "CREDITS-commons.md").write_text(fetch.credit_table(kept), encoding="utf-8")
    print(f"exact matches: {matched}; placeholders: {placeholders}")


if __name__ == "__main__":
    main()
