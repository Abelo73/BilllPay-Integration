# Proposal: call a seller, and see what is viewed

Status: proposal for decision, 18 November 2026. No code yet.
Written for: the Sodo Gebeya team (decisions in section 5).

## 1. Call a seller directly

**What it is:** a **Call** button on a product page and a shop page. A buyer taps it and their phone calls the seller.

**What exists today:** shoppers chat with sellers in the app. The shop page does not show a phone number to shoppers (`ShopViews`: "Shoppers never get the phone, address or staff notes"). Chat is the only way to reach a seller.

**Recommended rules:**
- **Opt-in by the seller.** The Call button shows only when the seller switches on "Let buyers call me" in shop settings. The number shown is the one the seller enters for calls, not the login phone.
- **Shown only on product and shop pages**, never in lists or search results, so numbers are not collected by scraping.
- **Business hours (optional).** The seller can set hours. Outside them the button says "Call later" and offers chat.
- **Off-platform warning, next to the button:** "Pay and order inside Sodo Gebeya. Never send money by phone transfer before you receive the item." This is the main scam risk, so it stays visible.
- **Track clicks, not calls.** The app counts that a Call button was tapped (for the seller's stats). It cannot know if the call happened.

**Better way (later, optional):** a masked number. The buyer calls an Sodo Gebeya number, which connects to the seller, so neither side sees the other's number. This needs a telephony provider and costs per minute. Recommend it only after the first version proves useful.

**Effort:** about 2 to 3 days for the opt-in button, hours and the warning.

## 2. See what is viewed (admin)

**What exists today:** orders, products and sellers are visible to admins. There are no view counts.

**Recommended: aggregated views only.**
- **Most viewed products, shops and categories**, per day, week and month, shown as a ranked list and a simple chart.
- **Traffic by day** (visits, product views, searches, chats started, orders placed), so admins see trends.
- **Top searches** (what people looked for), only for searches made at least 5 times, so a rare search cannot point to one person.
- **Where views came from** (search, category, shared link), counted, not tied to people.
- **Funnel:** views → chats started → orders paid, per product. This shows which listings turn interest into sales.

**What we should not build: "who sees what" per person.** Showing one person's browsing history is tracking a private person, which is a safety and privacy problem, and it would go against the data-protection rules we are working to. We count, we do not track people. If a seller wants to know how their own listing performs, they see counts for their listing only, never names.

**How it would work:**
- The app sends one small "view" event per product or shop page (no user id, no device id, no IP stored with it).
- Counts are kept per day. Raw events are kept for 7 days at most, then only the daily totals remain.
- Visitors who opt out of analytics are not counted (a simple switch in the cookie/privacy notice).

**Effort:** about 1 week: event collection, daily totals, the admin view with charts, and a seller's own counts.

## 3. Costs and risks

- **Scam through calls.** Mitigated by the warning, opt-in, and reporting.
- **Privacy.** Mitigated by aggregated counts, short retention, no per-person history, and the opt-out.
- **Load.** One small write per page view. Batched once a minute to keep the database light.
- **Wrong numbers.** Sellers may enter a number they don't answer. Mitigated by a "Report wrong number" link, and by letting the seller turn the button off at any time.

## 4. Phases

| Phase | What | Effort |
|---|---|---|
| 1 | Call button with opt-in, hours and warning | 2 to 3 days |
| 2 | Aggregated view counts and the admin ranking | About 1 week |
| 3 | Funnel and seller's own counts | 2 to 3 days |
| 4 | Masked calling (optional) | Depends on the provider |

Phase 1 and 2 can go in either order. Phase 2 needs no change for buyers, so it carries less risk.

## 5. Decisions needed

1. **Call button:** opt-in by each seller (recommended), or on for all shops?
2. **Which number** buyers see: a separate calling number (recommended), or the login phone?
3. **Business hours:** include in version 1, or later?
4. **Analytics:** aggregated only (recommended), with no per-person history?
5. **Raw view events kept:** 7 days (recommended), or longer?
6. **Masked calling:** do not build now (recommended), or plan it for a later phase?

## 6. What I need from you

- Your answers to section 5.
- Whether the privacy notice should mention analytics, so the opt-out wording is right.
