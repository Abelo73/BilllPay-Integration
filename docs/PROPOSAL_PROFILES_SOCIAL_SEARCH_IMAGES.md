# Proposal: profile links, photos and better search

Status: proposal for decision, 16 November 2026. No code yet.
Written for: the Sodo Gebeya team (decisions in section 6).

## 1. Do we need dating features? No.

Sodo Gebeya is a marketplace for buying, selling and finding local work. A dating feature would not help that, and it would create risks we should not take on:

- **Safety:** people would meet strangers through the app. We would become responsible for that, and we don't have the moderation to do it.
- **Privacy:** dating profiles need photos, ages and preferences. That is more personal data than a seller or buyer needs, and it would make the data-protection review much harder.
- **Trust:** the app's value is that sellers and buyers are real and checked. A dating feature could damage that trust.
- **Scope:** it is a separate product. Nothing in the current plan or the agreement covers it.

**What we do instead:** a public profile with a first name, picture, short bio and area (already built), and optional links to a person's social accounts (section 2). That gives people a sense of who they are dealing with, without turning the app into a dating app.

## 2. Instagram, Facebook and Telegram links

**What it is:** a seller, service provider or customer can add links to their Instagram, Facebook and Telegram on their profile or shop page. Buyers see the links as buttons.

**What exists today:** the app already has a Telegram link for notifications (`telegram_links`). The public profile and shops have no social links yet.

**Rules I recommend:**
- **Optional and owned by the person.** Nothing is imported automatically, and no account is scraped.
- **Only links we can check.** Accept `instagram.com/<name>`, `facebook.com/<name>` and `t.me/<name>` (the handle only). Reject any other address.
- **Shown as plain links,** opening in a new tab. We don't show follower counts or anything fetched from those sites.
- **Off-platform warning.** Next to any link: "Pay and order inside Sodo Gebeya. Never send money to a social account." This is the main scam risk, so it must be visible.
- **Hidden when the public profile is off** (the same switch as now).
- **Sellers only if they choose.** A shop can show its links on its page; a buyer's links only appear on their public profile.

**Effort:** about 3 to 4 days (backend fields and checks, profile and shop screens, a warning on each link).

## 3. Images to show

**What exists:** up to five photos per product (the first is the main one), a shop logo and cover, a profile picture, and admin banners in three places.

**What I recommend adding:**
1. **A shop photo gallery.** Up to six photos of the shop, its stock and its front, shown on the shop page. Same crop tool as the logo and cover.
2. **Better guidance on product photos:** a square crop before upload, at least 800 pixels, and a warning for a blurry or dark photo. The check is done in the browser; the server re-encodes the photo and removes camera data (as now).
3. **Thumbnails in search results,** so people see the product before they open it. Pictures load lazily, so slow phones are not held back.
4. **Reorder photos** by drag (the product photo screen already supports the main photo).
5. **Alt text** on every photo, so screen readers and slow connections still show something useful.
6. **Rule on people in photos:** no photo of a customer, and a photo of a seller only with their consent.

**Effort:** about 1 week.

## 4. Better search

**What exists:** the product search matches the name only, and then the category specs. Shops and sellers are matched by name. Saved searches exist (V32).

**What I recommend:**
1. **Search every word.** "blue phone case" finds listings with all three words, not just the exact phrase.
2. **Search the description and the shop name as well,** not just the name.
3. **Typo tolerance:** "iphon" still finds iPhone. In PostgreSQL this uses the `pg_trgm` extension and a trigram index, which needs no new service.
4. **Amharic and English together:** a short list of synonyms that we maintain (for example "phone" and "mobile" and the Amharic word), edited by the team, not guessed by a machine.
5. **Filters that people use:** area in Sodo, condition (new, used, like new), price range, and sort by newest, price low to high, or price high to low.
6. **Helpful empty results:** "No results for X. Try: …" with the nearest categories, instead of a blank page.
7. **Suggestions while typing** (debounced, already in the app's plan), and recent searches.

**What I would not do now:** a separate search service (for example Meilisearch or Elasticsearch). PostgreSQL with trigram search is enough for the current size, and a second service adds cost and something new to run. We revisit it when the catalog is much larger.

**Effort:** about 1 to 2 weeks.

## 5. Phases

| Phase | What | Effort |
|---|---|---|
| 1 | Better search: all words, typo tolerance, filters, sort, helpful empty results | 1 to 2 weeks |
| 2 | Photos: shop gallery, product photo guidance, thumbnails, reorder, alt text | About 1 week |
| 3 | Social links with checks and the off-platform warning | 3 to 4 days |

Phase 1 helps buyers the most, so I suggest starting there.

## 6. Decisions needed

1. **Dating features:** confirm they are not wanted. (Recommendation: not wanted.)
2. **Social platforms:** Instagram, Facebook and Telegram only, or add others?
3. **Who can show links:** sellers and service providers only, or every customer?
4. **Shop gallery size:** six photos, or more?
5. **Synonym list:** who owns it (recommendation: one team member, reviewed each month).
6. **Phase order:** search first, as recommended.

## 7. Risks

- **Scams through social links.** Mitigated by the off-platform warning and by paying only inside the app.
- **Personal photos.** Mitigated by consent and by no customer photos.
- **Search quality.** Trigram search finds close matches, not meanings. The synonym list is the fix, and it needs an owner.
- **Slow photos on weak networks.** Mitigated by thumbnails, lazy loading and small sizes.

## 8. What I need from you

- Your answers to section 6.
- The photos you want to use for the shop galleries. Once you have added them, I'll continue with phase 2.
