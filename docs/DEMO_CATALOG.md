# Demo catalog: at least 30 listings per goods category

Status: 15 November 2026. Written for: the Sodo Gebeya team and testers.

## What is in it

- **780 demo listings** in `backend/src/main/resources/demo/catalog.json` (171 existing + 609 added), across **26 goods categories**, each with at least 30 listings.
- **17 demo shops** (13 existing + 4 new: Sodo Motors, Sodo Tools & Hardware, Pet Corner Sodo, Office Supply Sodo).
- **One photo per listing** in `frontend/public/demo/<slug>.jpg`.
- Loaded and removed from **Admin → Demo data** (the existing loader). Everything it adds has a slug starting with `demo-`, so real shops and listings are not touched.

## Photos: two kinds, labelled

| Kind | Count | Source | Where to tell |
|---|---|---|---|
| Real photos | 171 | Wikimedia Commons, credits in `frontend/public/demo/CREDITS.md` | Existing credits file |
| Placeholders | 609 | Generated locally: colour block, product name, "DEMO PLACEHOLDER - NOT A PRODUCT PHOTO" | The text on each image |

The placeholders are not product photos. We did not copy photos from jiji.com.et or other sites: those photos belong to sellers, many carry their names or watermarks, and reusing them would be a copyright and privacy problem. Real photos can replace a placeholder later by keeping the same file name, with a credit added to `CREDITS.md`.

## Listings by category

| Category | Listings | Category | Listings |
|---|---|---|---|
| Laptops | 30 | Tables & desks | 30 |
| Desktop computers | 30 | Sofas | 30 |
| Tablets | 30 | Beds | 30 |
| Mobile phones | 30 | Mattresses | 30 |
| Phone accessories | 30 | Wardrobes & cabinets | 30 |
| TVs | 30 | Chairs | 30 |
| Kitchen appliances | 30 | Clothing | 30 |
| Beauty & health | 30 | Shoes | 30 |
| Baby & kids | 30 | Sports & outdoors | 30 |
| Books & stationery | 30 | Vehicles | 30 |
| Pantry | 30 | Coffee & tea | 30 |
| Tools & construction | 30 | Commercial equipment | 30 |
| Animals & pets | 30 | Business & industry | 30 |

## How it is built

The generator is `scripts/demo_catalog/expand_demo_catalog.py`.

- Each category has 6 to 10 base items written by hand, with a price in whole ETB and a condition.
- To reach 30, the generator adds colour, pack and size variants of those base items (for example "Silver", "Pack of 2"). Each variant gets its own placeholder photo.
- The run is repeatable: running it again on the clean catalog produces the same result.
- It checks the result: every category has at least 30 listings, all shops and categories exist, prices are whole numbers, and every photo file is present.

Run it from the repo root:

```
python3 scripts/demo_catalog/expand_demo_catalog.py          # write, then check
python3 scripts/demo_catalog/expand_demo_catalog.py --check  # check only
```

## Known limits

- **Variant names are sometimes odd.** Used vehicles and some tools get variants like "Toyota Corolla 2010 used - Gold". Fine for testing, but do not use these names as examples of real listings.
- **Prices are demo prices**, not market research. Check against real listings before any pricing decision.
- **Specs are empty** for the new listings. Category fields (brand, RAM, size) need filling if we want the filters to show them.
- **Not covered here:** Property, Services, Jobs and Seeking Work. These are not goods. They map to other modules (`pro_profiles`, `job_posts`, `talent_profiles`). Property has no module yet, so it needs a decision first.
- **Size:** the 609 placeholder photos add about 9 MB to the repository.
- The loader was not run against a live database in this change. Test it once through **Admin → Demo data** on the dev stack before relying on it.
