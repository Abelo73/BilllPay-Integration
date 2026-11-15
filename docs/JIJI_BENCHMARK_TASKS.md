# Sodo Gebeya: tasks from the Jiji Ethiopia benchmark

Status: draft, 15 November 2026. Written for: the Sodo Gebeya team (planning).

## What we know about Jiji Ethiopia (secondhand)

Direct access to jiji.et failed from the build machine (TLS handshake error), so this list comes from public descriptions only. Treat it as a starting point, not a verified feature list.

- A horizontal classifieds marketplace: private people and businesses post ads across many categories (vehicles, property, electronics, phones, appliances, fashion, jobs, services). Source: [Jiji Africa, Wikipedia](https://en.wikipedia.org/wiki/Jiji_Africa).
- Sellers post ads with descriptions and photos; buyers and sellers talk through in-app chat about price and delivery. Source: [Jiji Ethiopia on webcatalog](https://webcatalog.io/en/apps/jiji-et).
- Jiji does not handle payment or logistics itself; buyers and sellers arrange both. Source: [Jiji Africa, Wikipedia](https://en.wikipedia.org/wiki/Jiji_Africa).
- Jiji has launched premium services aimed at businesses and SMEs. Source: [Capital Ethiopia](https://capitalethiopia.com/2024/06/10/jiji-expands-premium-services-to-ethiopia/).
- A 2022 Shega review praised the simple design and the messaging feature. Source: [Shega review](https://shega.co/news/review-of-the-top-3-online-marketplaces-in-ethiopia-jiji). The review's body was not readable from our tools, so its other points are unknown.
- An App Store review alleges fraud and the developer's reply was general. Source: [App Store, Jiji Ethiopia](https://apps.apple.com/us/app/jiji-ethiopia/id1525181998?l=ru). Trust and safety is a real risk for any classifieds product.

Where Sodo Gebeya differs: **BillPay payments and local delivery are built in**, so buyers do not have to arrange payment or delivery themselves. That is the main product difference to protect.

## Task 0: get real data (blocking, owner: you)

These tasks cannot be finished well without first-hand data.

- [ ] **T0.1** On a phone, open the Jiji Ethiopia app (or jiji.et from a different network or browser) and record 30 listings across at least 5 categories. For each: category, fields shown, number of photos, how price is shown, location shown, whether chat or a phone number is offered, and any delivery or payment note.
- [ ] **T0.2** Note the posting flow: how many steps, required fields, and what happens after posting (review, approval, expiry).
- [ ] **T0.3** Note the search and filter options (category, price, location, sort).
- [ ] **T0.4** Save screenshots to `docs/benchmark/jiji/` (no personal data of sellers in the files; blur phone numbers and names).
- [ ] **T0.5** Send the sheet or screenshots back. We will turn it into a verified feature list and replace the secondhand list above.

## Task 1: product tasks Sodo Gebeya can start now

Each task is a product decision or a build item. Items marked **decide** need your answer before work starts.

| # | Task | Why (benchmark signal) | Done when |
|---|---|---|---|
| 1.1 | Category tree as data (start with food, clothing, household, electronics; add more by row, not by code) | Jiji covers many categories; Sodo needs fewer but must be easy to extend | Admin can add a category without a deploy |
| 1.2 | Listing form: title, description, price in ETB (whole birr as integers, never floats), photos (up to N, compressed), Sodo location (kebele), condition | Standard classifieds fields | A seller can post in under 2 minutes on a phone |
| 1.3 | Photo handling: resize and compress on upload, serve as WebP where supported | Photos are the main cost on slow data | Photo page weight shown in the performance proposal's budget |
| 1.4 | Search and filters: category, price range, location; debounced search box | Jiji offers search and filters | Search does not fire on every keystroke |
| 1.5 | Buyer-seller chat inside the app | Jiji's messaging is a praised feature | Messages are stored per listing; contact details are not shown until the seller chooses |
| 1.6 | Report listing or seller, with an admin review queue | Fraud allegations against Jiji | A report reaches the admin queue and can be actioned |
| 1.7 | BillPay checkout on the listing (buy now) | Our differentiator: Jiji leaves payment to users | Payment confirmation updates the order; no card or account details stored by us |
| 1.8 | Local delivery option (seller or courier), with a delivery status | Our differentiator: Jiji does not handle delivery | Buyer sees delivery status per order |
| 1.9 | Listing expiry and renewal (e.g. 30 days) | Keeps old listings from clogging search | Expired listings drop out of search |
| 1.10 | Mobile-first pages with skeleton loading and lazy photos | Users on slow phones and data plans | Meets the performance budget on a throttled phone profile |

## Task 2: decisions needed from you (decide)

- [ ] **D1 Seller verification.** None (fastest), phone-verified (recommended for launch), or ID-verified (slower, more trust). Which level for launch?
- [ ] **D2 Premium or SME plan.** Free only at launch, or a paid featured-listing or shop plan? Jiji has one; do we want one before launch?
- [ ] **D3 Contact details.** Show seller phone on listings, or only through chat and BillPay? (Recommended: chat and BillPay only, to reduce off-platform payment.)
- [ ] **D4 Who holds the money on a BillPay order.** Paid straight to the seller, or held until the buyer confirms delivery? This is a business and legal question; the technical side depends on the answer.
- [ ] **D5 Moderation.** Who reviews reports (you, or a hired person), and how fast?
- [ ] **D6 Languages.** Amharic and Afaan Oromo and English on day one? Jiji's Ethiopian app language setting should be checked in T0.1.

## Task 3: risks to track

- **Fraud and off-platform payment.** Sellers may ask buyers to pay outside BillPay. Mitigation: D3, D4 and the report flow (1.6).
- **Trust at launch.** Early bad experiences drive users away. Mitigation: D1 and a manual review of the first 100 listings.
- **Data accuracy.** This benchmark is secondhand until Task 0 is done. Do not commit product scope from it alone.

## Next step

Do Task 0 (about one hour on a phone), then send the sheet. We will update this document with verified data and the decisions in Task 2.
