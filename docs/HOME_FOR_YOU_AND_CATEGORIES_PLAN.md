# Categories and "For you" on the home page: plan

Status: plan for review, 16 November 2026. No code yet.
Decisions for you: section 8.

## 1. What we want

1. **Categories that look modern and are easy to use**, now that there are 19 main categories and 82 sub-categories
   (`scripts/add_categories.py`).
2. **A home page that fits each visitor.** Someone who keeps searching for laptops sees laptops first; someone who
   looks at headsets sees headsets; someone who searches for tables sees tables.
3. **No surprises about data.** A visitor can see why something is shown and clear their history in one tap.

## 2. What exists today

- **Home page** (`frontend/src/pages/home.tsx`): hero with a search box, stats, a "bento" grid of categories, how
  it works, "Popular right now" (featured listings), skilled workers.
- **The category grid shows the first 7 rows of one flat list** (`data.slice(0, 7)`). With sub-categories that list
  mixes main and sub-categories in the order they were added, so the home page shows a random-looking set.
- **`GET /api/categories`** returns `id, name, slug, parentId` only: no listing counts, no order by main category.
- **Shop page** filters by category, price, area and details; **saved searches** with alerts exist.
- **Favourites** (heart) exist.
- **Nothing records searches or viewed listings**, so the shop can't tell what a visitor is interested in.

## 3. Privacy first (how the "For you" part stays safe)

- **Phase 1 keeps the history on the visitor's own device** (browser storage), never on our server. No account
  needed, nothing to leak, nothing for staff to see. Clearing the browser clears it.
- **What is kept:** the last 50 actions, each only *category*, *brand* (when the listing has one), *search words*
  and *time*. Older than 30 days is dropped.
- **Shown to the visitor:** every "For you" row says why ("Because you looked at Laptops"), and the home page has
  **"Clear my history"** and a switch **"Use my activity to suggest listings"** (on by default, off in one tap).
- **Never personalised:** Beauty & Health → Medical supplies is left out of the history, so
  a shared phone never shows someone's health searches on the home page.
- **Phase 3 (optional) syncs it to the account** for signed-in people who switch devices. That stores personal data
  on our server, so it waits for a clear notice and your decision (section 8, D3).

## 4. Categories: the design

### 4.1 Home page: "Shop by category"
- **Main categories only**, in the admin's order, as large cards: icon, name, number of listings, and up to 3
  sub-category chips (e.g. **Electronics** · 64 listings · Phones · Laptops · TVs).
- **Personal order:** the visitor's top categories come first (from section 5); everyone else sees the admin order.
- Phone: a 2-row horizontal scroll with a "See all" card at the end. Desktop: a 4-column grid, the first card big.
- Empty main categories (0 listings) are hidden on the home page, kept on the "All categories" page.

### 4.2 New page: `/categories` ("All categories")
- A grid of the 19 main categories. Tapping one opens its sub-categories with counts, each going to
  `/shop?category=<slug>`.
- A **filter box** at the top ("Find a category: sofa, cement, goats…") that matches main and sub-category names.
- Each main category gets its **own icon and colour** (lucide icons: Laptop, Home, Tractor, PawPrint, HardHat,
  Wrench, Sun, Shirt, Music, Gift…), still within the shop's green/amber look.

### 4.3 Header
- **Desktop:** a "Categories" button opens a mega menu: main categories on the left, the hovered one's
  sub-categories on the right with counts.
- **Phone:** the same as a bottom sheet: an icon grid of main categories, then the list of sub-categories.

### 4.4 Backend
- `GET /api/categories` gains `listingCount` (active, visible listings, sub-categories included in the main one's
  count) and stays cached for 5 minutes. Optional `?tree=true` returns main categories with their `children`.

## 5. "For you": the design

### 5.1 What counts as interest (on the device)

| The visitor… | Counts for | Weight |
|---|---|---|
| saves a listing (heart) | its category and brand | 5 |
| opens a listing | its category and brand | 3 |
| opens a category | that category | 2 |
| searches (presses Search) | the words, and the category most of the first results are in | 2 |

- Older actions count less (half the weight after 7 days) and are dropped after 30 days.
- **Top interests** = the 3 categories (and up to 2 brands) with the highest total.

### 5.2 What the home page shows

With history (the section sits right under the search box, above everything else):
1. **"Picked for you"** heading, with **Why?** and **Clear** links.
2. Up to **3 rows**, one per top interest, 8 listings each, newest first:
   - "Because you looked at **Laptops**" → `/shop?category=laptops`
   - "More from **Samsung**" (when a brand stands out) → search for the brand
   - "You searched for **headset**" → the search again
3. **"Recently viewed"**: the last 8 listings opened (still available ones only).
4. **Recent searches** as chips under the search box; tapping one searches again.

No history yet (a first visit): the home page stays as it is, plus **"Popular searches in Sodo"** chips (Phase 2).

Listings already seen many times, sold, or from blocked shops are skipped. Each row hides itself when it has
fewer than 4 listings.

### 5.3 Example
A visitor searched "laptop" twice and opened 3 laptops (HP twice) this week:
- Laptops: 2×2 + 3×3 = **13**, HP: 2×3 = **6**
- Home page: "Because you looked at Laptops", then "More from HP", then the usual sections.
A week later they look at sofas a few times: sofas take the first row, laptops move to the second.

### 5.4 Backend
- **Phase 1 needs no new endpoint:** each row uses `GET /api/products?category=…&size=8&sort=newest` or `?q=…`.
- **Phase 2:** `GET /api/products/for-you?categories=laptops,tvs&brands=hp` returns all rows in one call (fewer
  requests on slow phones), and **popular searches**: the backend counts search words per day (words only, no person,
  no IP) in a `search_counts (term, day, count)` table. A word is shown only after **10 or more different searches**
  in 7 days, so no single person's search ever appears. Words with phone numbers or digits only are never counted.

## 6. Phases and tasks

### Phase 1: categories redesign and on-device "For you" (frontend only, about 4 days)
- [ ] C1 `/api/categories`: `listingCount`, tree order (small backend change and test)
- [ ] C2 Home "Shop by category" cards (main categories, counts, 3 chips, personal order)
- [ ] C3 `/categories` page with filter box and icons per main category
- [ ] C4 Header mega menu (desktop) and bottom sheet (phone)
- [ ] F1 `lib/interests.ts`: record actions, weights, decay, 50-action cap, medical excluded, clear, on/off switch
- [ ] F2 Record from: listing page, category open, search submit, heart
- [ ] F3 Home "Picked for you" rows, "Recently viewed", recent-search chips, Why? / Clear
- [ ] F4 Amharic texts for the new screens (`locales/am`)
- [ ] T1 Tests: interest scoring (unit), home with and without history (e2e), Clear removes everything

**Done when:** a new visitor sees the normal home page; after searching "laptop" twice and opening 2 laptops, the
home page's first row is laptops with "Because you looked at Laptops"; "Clear my history" brings back the normal
home page; nothing about it reaches the server.

### Phase 2: popular searches and one-call rows (about 2 days)
- [ ] P1 `search_counts` table and counting (k ≥ 10, no digits-only words), "Popular searches in Sodo" chips
- [ ] P2 `GET /api/products/for-you`
- [ ] P3 Admin → Reports: top searches this week, and searches with no results (shows what sellers should list)

### Phase 3 (only after D3): history follows the account
- [ ] A1 Opt-in sync of the interest summary (not the raw actions) to the account
- [ ] A2 "New in your interests" in the weekly notification or Telegram, using saved searches

## 7. How we'll know it works
- Clicks on "Picked for you" rows compared with "Popular right now" (counted as totals only, per row type, with the
  shop's existing metrics; no per-person tracking).
- "Searches with no results" (Phase 2) falling as sellers add what people look for.

## 8. Decisions for you
- **D1** Personalise by default, with a one-tap off switch (recommended), or ask first?
- **D2** Which categories to leave out of personalisation? (Plan: Medical supplies. Add others?)
- **D3** Phase 3, history on the account: yes later, or keep it on the device only?
- **D4** Popular searches: show them to everyone, or only in Admin → Reports?
