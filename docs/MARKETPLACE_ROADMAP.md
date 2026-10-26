# Sodo Gebeya: Roadmap

**Draft, 2026-10-24.** Turns TenaShop into the Sodo Gebeya marketplace described in [MARKETPLACE_PLAN.md](MARKETPLACE_PLAN.md). Screen numbers (S1–S21) refer to the design canvas: https://claude.ai/artifact/BSK6pvdE3TYwE5BMSvpwz7

Each milestone ends with automated tests, a demo, and a commit. Durations are estimates for one developer working with Claude; adjust as we learn.

---

## Overview

| Phase | Milestones | Result | Estimate |
|---|---|---|---|
| **0. Prepare** | Decisions, legal, accounts | Ready to build and to launch | runs alongside phase 1 |
| **1. Foundation** | M1–M4 | Many sellers can sign in by phone, get verified and list items | 4–5 weeks |
| **2. Buying and money** | M5–M8 | Real orders, held payments, payouts, cash on delivery | 4–5 weeks |
| 🚀 **Pilot launch** | | 50 shops, real orders in Sodo | |
| **3. Engagement** | M9–M12 | Search, chat, notifications, reviews | 4 weeks |
| **4. Services** | M13–M15 | Hire electricians, tailors and other pros | 3–4 weeks |
| **5. Income** | M16–M17 | Boosts, Pro shop plan, ads | 2 weeks |
| **6. Local reach** | M18–M20 | Amharic and Wolaytta, installable app, Telegram bot | 3 weeks |
| **7. Delivery network** | M21–M22 | Rider pool and rider app | 3 weeks |
| **8. Scale** | M23–M25 | Security, performance, other towns | ongoing |

---

## Phase 0: Prepare (no code, starts now)

| # | Task | Owner | Done when |
|---|---|---|---|
| P0.1 | Answer the 8 decisions in [MARKETPLACE_PLAN.md §12](MARKETPLACE_PLAN.md#12-decisions-needed-from-you-before-we-start) | You | Written down |
| P0.2 | Pick the final name; buy the domain (.com and/or .et) | You | Domain registered |
| P0.3 | Business registration, trade licence covering online marketplace, TIN | You + accountant | Licence in hand |
| P0.4 | BillPay **live** merchant: finish KYC (the 13 missing details), ask about holding funds and paying out to sellers, live fees, refund limit | You | Live keys + written answer on payouts |
| P0.5 | AfroMessage: new token, top-up, sender name "SodoGebeya" approved | You | Test SMS received |
| P0.6 | Terms of use, seller agreement, privacy policy, prohibited items list | You + lawyer | Drafts reviewed |
| P0.7 | Hosting: a server (or cloud), backups, a business email | You + Claude | Server reachable |
| P0.8 | Line up the first 20 shops and 10 pros who agree to try it | You | Names and phones in a list |

---

## Phase 1: Foundation

### M1. Rebrand and clean base (1 week) ✅ Done 2026-10-24
- Rename TenaShop → Sodo Gebeya: logo, colours and fonts from the design; new home page **S1**
- Keep everything that works: BillPay, admin, monitoring, tests, emails
- Mobile-first layout and the bottom menu used on every phone screen
- **Done when:** the site looks like the design on a phone, and all existing tests pass

Result: green/amber palette and Plus Jakarta Sans + Noto Sans Ethiopic; new logo, favicon and page title; phone header with place line, search and cart; bottom menu (Home, Shop, Orders, Account; Services, Sell and Chats join when built); new home (search, categories from the admin with icons, popular items, "Sell on Sodo Gebeya", how it works, FAQ); fake testimonials and newsletter removed; product cards for 2-column phone grids; emails, admin logo and the BillPay payment description renamed. Code packages keep their `et.tenapay.shop` names. Amharic line on the home page needs a native-speaker check.

### M2. Phone sign-in (1 week) ✅ Done 2026-10-24
- Sign in with phone number and SMS code through AfroMessage (**S13**); email becomes optional
- Rate limits and lockout for code requests; codes expire after 5 minutes
- Language picker shown (English / Amharic now, Wolaytta later)
- **Done when:** a new user signs up with only a phone number; code abuse is blocked; tests cover expiry and limits

Result: `/login` and `/register` are phone-first (number → 6-digit code → name on the first sign-in), email and password still available. Ethiopian mobiles only (09/07). Codes: HMAC-stored, 5 minutes, 5 tries, one per minute and 5 per hour per phone, 20 per hour per network address. Only SMS-proven phones sign in; staff can't use the phone door; phone-only accounts have no password and their sign-in phone can't be edited away. SMS module: AfroMessage when `AFROMESSAGE_TOKEN` is set, otherwise test mode (logged, listed in Admin → SMS, code shown on screen only with `SMS_DEV_CODES_IN_RESPONSE=true` in sandbox). Admin → **SMS** log with provider status. Metrics `tenashop_sms_total`, `tenashop_auth_phone_total`. Tests: `PhoneSignInIntegrationTest` (7), `AfroMessageGatewayTest` (4). Language picker moved to M18 (full translations), so no half-working switch is shown.

### M3. Sellers and shops (1.5 weeks) ✅ Done 2026-10-24
- Account types: buyer, **shop**, **individual seller**, (later) pro
- Shop page: logo, cover, description, location, rating; seller's own product list
- Sellers manage **only their own** products and orders (reuse the existing catalog admin, scoped per seller)
- Seller home on phone (**S17**) and web dashboard (**S20**), first version
- Admin approves new shops
- **Done when:** two different shops each list products and cannot see or edit each other's

Result: any customer account opens one shop at **/sell** (a shop, or "just me" for an individual), with phone, area, address, about, logo and cover. New shops wait in Admin → **Sellers** (badge with the count); staff approve, reject with a reason (the seller fixes it and it comes back) or pause an open shop; the seller gets an SMS each time. Products of a shop show and can be bought only while it's approved (`Product.sellable()`; store queries, product page and checkout all check it). Existing products stay "sold by Sodo Gebeya" (`products.shop_id` null).
- Seller area **/seller** (phone first, design S17): sales today and this month (their own lines only), to send / on the way / products shown / low stock, orders to pack, best sellers, "Add a product". Products use the admin's product editor limited to their own (no URL slug or Featured).
- Seller orders: only **paid** orders with their items, and only their lines. They mark packing → on the way (with a rider note the buyer sees) → delivered; only Sodo Gebeya can cancel a paid order. An order that also holds other sellers' items stays with Sodo Gebeya until M5 splits orders: the seller sees just the first name and no phone or address.
- Store: "Sold by" card on product pages, seller name on product cards, public shop page **/shops/{slug}** (no phone shown), "Sell" in the header and the phone menu; Admin → Products shows and filters by seller.
- Isolation: every `/api/seller/**` call resolves the caller's own shop; another shop's product or order answers 404. Tests: `SellerIntegrationTest` (4: approval gating, two shops can't reach each other, seller orders and mixed orders, account rules), plus a browser walkthrough on a phone-size screen (open shop → add product with photo → approve → shop and product pages → pay → pack and send).
- Still open: S20 desktop layout beyond the phone one, ratings (M12), payouts (M6), the real Sodo neighbourhood list (M4; the area field accepts any text and suggests four).

### M4. Verification and listings (1.5 weeks) ✅ Done 2026-10-24
- Verification flow (**S18**): ID front/back, selfie, shop or skill details; private storage, staff only
- Admin verification queue (**S21**): approve, reject, ask for a better photo; Verified badge
- Post a listing from the phone (**S16**): item or service switch, up to 5 photos (built), condition, price, negotiable, area
- Used items from individuals; neighbourhood list for Sodo
- Report a listing; admin hides it
- **Done when:** a verified shop and a private seller both post listings from a phone; admin can hide a reported one

Result:
- **Get verified** (Sell → Get verified, design S18): ID type (Fayda, kebele, passport, driving licence), both sides, a selfie holding it, optional trade licence and a note. Photos are re-encoded (camera data such as GPS dropped) and stored under `private/`, which the public photo route never serves; only the seller and staff can open them, never cached. Admin → **Verifications** (S21): approve (Verified badge on the shop page, product page and product cards), ask for a better photo (the seller fixes and sends again) or reject; the seller gets an SMS each time.
- **Listings** (S16): condition (new, like new, used), "price negotiable" and the item's area (else the shop's) in the product editor and on product pages. Admin → **Areas**: the list of Sodo neighbourhoods offered in forms; it starts with the five from the design, so staff add the real ones there.
- **Report a listing**: signed-in shoppers only, once each, not their own (reasons: scam, fake, not allowed, wrong details, offensive, other). Admin → **Listing reports**, most reported first: take it down (off the store and out of checkout; the seller is told why and can't switch it back on) or dismiss; "Put back" lifts a take-down.
- Tests: `VerificationAndListingsIntegrationTest` (3: verification flow and photo privacy, listing details and reports, areas), plus a browser walkthrough on a phone-size screen.
- Item or service switch: services are their own listings since M13 (pro profiles, job requests).

---

## Phase 2: Buying and money

### M5. Multi-seller cart and orders (1 week) ✅ Done 2026-10-25
- Cart grouped by seller (**S4**); one checkout makes **one order per seller**, each with its own delivery fee
- Order tracking per order (**S6**) with seller steps: packed → on the way → delivered
- **Done when:** a cart with items from 2 shops becomes 2 orders, each tracked separately

Result: one checkout, one BillPay payment, and **one parcel per seller** (`order_parcels`, numbered `<order>-1`, `-2`, …; Sodo Gebeya's own items first). Splitting the payment itself would have meant several BillPay payments per cart, so the buyer pays once and each parcel is fulfilled on its own; M6 payouts attach to parcels.
- Cart drawer grouped by seller; checkout shows the delivery fee per seller (`POST /api/checkout/quote`). The free-delivery rule applies per parcel, and a discount is spread over the parcels by value (each parcel stores its share).
- Each seller moves only their own parcel (packing → on the way with a rider note → delivered) and always gets the buyer's name, phone and address. Staff can move one parcel (Admin → order → Parcels) or the whole order (every parcel that can take the step). The order's status follows its slowest parcel, so it is "delivered" once all parcels are.
- Buyer's order page: one progress line per seller with the rider note. Email, SMS and in-app messages say "part of your order" only when the order really has more than one parcel.
- Existing orders got one parcel per seller found in their lines (migration V22).
- Tests: `OrderParcelsIntegrationTest` (3: three sellers delivered separately, discount spread and partial cancel, single-seller orders unchanged); `SellerIntegrationTest` updated (a seller now delivers their parcel of a mixed order); browser walkthrough.

### M6. Protected payments and payouts (1.5 weeks) ✅ Done 2026-10-25
- BillPay payment held by the platform; **released** when the buyer taps "I received my items" (**S6**) or 48 h after delivery with no complaint
- Commission per seller and category (configurable in admin, 0% at launch if you choose)
- Seller balance: held, available, paid out (**S17**, **S20**); payout requests and payout history
- Admin payouts screen; export for accounting
- **Done when:** a test sale moves money held → available → paid out, with the commission recorded, and the numbers match BillPay settlements
- **Depends on:** P0.4 (BillPay's answer on payouts)

Result: each parcel's earnings are held when fulfilment starts, released when the buyer confirms receipt (or 48 h after delivery, hourly job), and cancelled with the parcel or a full refund. Sellers request payouts in Seller → Money; staff mark them sent in Admin → Payouts (CSV export) and set commission rules in Admin → Fees (most specific rule wins, 0% by default). Tests: `PayoutIntegrationTest`.

### Feature switches and Jiji-style buying ✅ Done 2026-10-25
- Admin → Features: ON/OFF switches and prices without a restart (online payment, sellers' phones, Sodo Gebeya's phone, Jobs & CVs).
- **Online payment is OFF by default.** Buyers call, WhatsApp or chat with the seller and pay them directly; switching it on brings back cart, checkout and held payments (M5, M6).

### M7. Cash on delivery (0.5 week)
- Checkout choice BillPay / cash (**S5**); cash only for verified sellers and under a limit
- Seller marks "cash received"; commission for cash orders is charged to the seller's balance
- **Done when:** a cash order completes and the commission shows on the seller's statement

### M8. Disputes v1 (1 week) ✅ Done 2026-10-25
- "Problem with this order?" with reason and photos (**S6**)
- Admin dispute queue with deadline (**S21**): refund (full or partial through BillPay), release to seller, or split
- Payout of a disputed order stays held until decided
- **Done when:** a dispute is opened, decided, and the money goes the right way

Result ("Problems"): the buyer reports a problem on a paid parcel (reason, details, up to 4 photos); its money stays held (no automatic or receipt release); buyer and seller talk in one thread (Seller → Problems); staff settle in Admin → Problems: refund, part refund (seller gets the rest) or pay the seller. Tests: `DisputeIntegrationTest`.

### 🚀 Pilot launch gate
All of these must be true:
- [ ] M1–M8 done and tested; BillPay **live** working with a small real payment
- [ ] At least 20 verified shops with 10+ products each
- [ ] Legal pages published; support phone number on the site
- [ ] Backups tested by restoring; monitoring alerts go to a real phone or email
- [ ] Staff know how to handle verifications and disputes

---

## Phase 3: Engagement

### M9. Search and browse (1 week)
- Full-text search (Amharic and English), filters: category, price, new/used, area, "delivers today" (**S2**)
- Sort: nearest, newest, price, best rated; saved items (heart)
- **Done when:** searching "shoes" under 3,000 ETB near the university returns the right items quickly

### M10. Chat (1.5 weeks)
- Buyer ↔ seller and customer ↔ pro chat (**S11**, **S12**): text, photos, listing card
- **Make an offer** / counter / accept → goes straight to the cart at the agreed price
- Safety warning when a phone number or "transfer" appears; report and block; staff can read reported chats only
- **Done when:** a buyer and seller agree a price in chat and the order uses that price

🟡 Mostly done 2026-10-24 (session 16): buyer ↔ shop chat (S11/S12) from a product page ("Chat with seller"): text and photos, unread counts and a Chats item with a badge in the phone menu, offers with counter / accept / decline / withdraw (an accepted price stays valid 48 h), safety flag and warning on messages that look like off-platform deals (phone numbers, "send money first", Telebirr…), block, report, Admin → **Chat reports** (staff can read only reported chats), at most one SMS nudge per conversation every 6 h. Messages refresh every 4 s (WebSocket later). V17, `ChatIntegrationTest` (4). **Still to do:** checkout at the agreed price, after M5 rewrites checkout (`ChatService.agreedPrice` / `markOfferUsed` are ready).

### M11. Notifications (0.5 week)
- In-app notifications (**S15**), SMS for key events (order paid, on the way, new quote, payment reminder), emails kept
- Each user picks what they get
- **Done when:** each key event reaches the right person once, by the right channel

🟡 Part done 2026-10-24 (built alongside M3): **order SMS**: finish-paying reminder, payment received, on the way (with the rider note), delivered. Each fits one 160-character plain-text SMS, goes only to Ethiopian mobiles, and is sent once per event (unique key, V16). Events older than 30 minutes are skipped, and a new SMS listener starts from the newest event, so switching SMS on never texts about old orders. Off with `SMS_ORDER_UPDATES=false`; in test mode they show in Admin → SMS as "logged". Test: `SmsOrderUpdatesIntegrationTest`. Still to do: in-app notifications (S15), per-user choices, "new quote" (needs M14), checkout email optional.

✅ Done 2026-10-24: **in-app notifications** (S15, `/notifications`, V21). A bell in the header shows the unread count. Items come from order events (payment received, new order to pack for the seller, payment failed, reminder, on the way, delivered, expired, cancelled, refunded), chats (one per conversation per hour), and jobs (direct request, new price, accepted, cancelled). Each item is stored once (unique key); tap opens the order, chat or job and marks it read; "Mark all read". Items older than 90 days are cleaned daily. **Per-user SMS choices** for orders, chats and jobs on the same page (no saved row = all on); the app inbox always gets everything. Test: `InboxIntegrationTest`. Still open: checkout email optional, push notifications (M18 PWA).

### M12. Reviews and ratings (1 week)
- Review only after a completed order or job; star rating plus text; seller can reply once
- Ratings on shop, product and pro pages; response time shown
- **Done when:** reviews can't be posted without a completed purchase

✅ Done 2026-10-24 (session 16): one review per bought item, only after delivery; 1–5 stars + text; shown as "Hana G." with a Verified purchase label; summary with star bars on product (and shop) pages; "Rate what you received" box in My account; the shop replies once; Admin → **Reviews** to hide (hidden ones stop counting). V18, `ReviewIntegrationTest`. Shop page and seller-area review list to be plugged in by the M4 owner (`ReviewsSection shopSlug`, `/api/seller/reviews`).

---

## Phase 4: Services

### M13. Pro profiles (1 week)
- Pro profile (**S8**): skills, price list, past work photos, area, hours, Verified badge
- Services home (**S7**) with categories and top-rated pros
- **Done when:** 10 real pros have complete profiles

✅ Built 2026-10-24 (session 16): pro profile (trade, headline, areas, years, bio, price list, up to 6 work photos) at /pro, staff approval in Admin → **Pros** (SMS on decision), Hire a pro page (S7) with trade filters and search, public profile (S8), rating and jobs-done from completed jobs. The 10 real pros are your field work.

### M14. Job requests and quotes (1.5 weeks)
- Describe a job (**S9**): type, text, photos, when, where, budget
- Sent to matching pros nearby; pros send quotes; customer compares (**S10**)
- **Done when:** a job gets 2+ quotes and the customer accepts one

✅ Done 2026-10-24 (session 16): post a job (S9: trade, description, up to 3 photos, when, where, budget) or send it to one pro from their profile; pros of that trade see it at /pro and send a price; the customer compares quotes (S10) and accepts one, and only then do both see each other's phone; cancel; mark done with a 1–5 rating. SMS: new quote (max one per job per hour), quote accepted, direct request, job cancelled. V19, `ServicesIntegrationTest` (3). Deposits come with M15.

### M15. Deposits and job completion (1 week)
- Accepting pays a deposit through BillPay (held); "job done" releases deposit and balance to the pro
- Job disputes use the M8 flow
- **Done when:** a job goes request → quote → deposit → done → paid → reviewed

---

## Phase 5: Income

### M16. Boosts (1 week) ✅ Done 2026-10-26
- Boost a listing (**S19**): 3/7/14 days, paid with BillPay; Boosted label; top of search and home; auto-post to Telegram channel
- **Done when:** a paid boost moves a listing to the top and ends on time

Result: sellers boost from Seller → Products (3/7/14 days, prices in Admin → Features); while online payment is off they pay by telebirr or bank and enter the transaction number; staff confirm in Admin → Boosts & plans and the listing goes on top of search with a Boosted label and into "Top listings" on the home page until the end date. Telegram auto-post not done yet.

### M17. Pro shop plan and ads (1 week) ✅ Done 2026-10-26
- Free vs **Pro shop** monthly plan (more products, banner, statistics, lower commission), renewal reminders
- Simple banner ads managed in admin
- **Done when:** a shop upgrades, pays, and its limits and commission change automatically

Result: free shops can list up to 20 products (Admin → Features); the Pro plan (1/3/6/12 months) removes the limit, adds a Pro badge on the shop and product pages, statistics per product (phone shown, chats, offers) and 2 points less commission; renewal SMS 3 days before the end. Home banners in Admin → Banners (picture, link, dates, click count). Tests: `PromoIntegrationTest`.

---

## Phase 6: Local reach

### M18. Amharic and Wolaytta (1 week)
- Full Amharic translation; Wolaytta with a native speaker; language remembered per user; SMS in the user's language

🟡 Mostly done 2026-10-25 (V29). **English / አማርኛ switch** in the header (starts in Amharic when the phone is set to Amharic; remembered on the device and on the account). **Every customer screen is translated** (about 1,000 lines in `frontend/src/locales/am/`, one file per area; the English text is the key, missing lines show in English): menus, home, sign-in, account, shop, product, cart, checkout, order tracking and problems, chats, notifications, reviews, Hire a pro, pro dashboard, job board, employer pages, talent profile and CV pages. **SMS in Amharic** for people who chose it: sign-in code, order updates, chat and job alerts (`sms/SmsLanguage` helper). Still to do: seller area (after boosts/plans), the printed CV body follows its own language switch, dates are formatted in English, dispute/payout/verification SMS, admin stays English. **Needs you:** a native speaker to review the Amharic (first draft by us), and someone to write Wolaytta.
### M19. Installable app (PWA) (1 week)
- Add to home screen, works on slow connections, offline pages, push notifications on Android

🟡 Mostly done 2026-10-24: web app manifest (name, green theme, shortcuts to Shop and My orders), PNG icons incl. maskable and Apple touch icon, service worker (`public/sw.js`, production builds only): pages network-first with an offline page, built files cache-first, images refreshed in the background, `/api` never cached. "Get the Sodo Gebeya app" banner in the footer when the browser offers install; nginx serves `sw.js` and the manifest uncached. Still to do: push notifications (needs a push service and M11 in-app notifications).
### M20. Telegram bot (1 week)
- Order and chat alerts in Telegram; browse new listings; channel auto-posts

🟡 Built 2026-10-24, waiting for a bot (V23). **Connect Telegram** on the Notifications page opens the bot with a one-time code (15 minutes); after Start, every in-app notification (orders, chats, jobs) also arrives in Telegram with an "Open" button. Bot commands: /new (5 newest listings), /stop (alerts off), /help. New listings from the last day are posted to the channel every 5 minutes, each once. The webhook only accepts calls carrying the secret. Admin → SMS shows the bot status, linked people, and "Connect webhook" and "Post new listings now" buttons. With no token it runs in test mode (messages are only logged and shown there). Test: `TelegramIntegrationTest`. **Needs you:** create the bot with @BotFather and a channel, put `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID` in .env, then press "Connect webhook". Still open: Amharic bot texts, browsing by category in the bot.

---

## Phase 7: Delivery network

### M21. Delivery zones and riders (1.5 weeks)
- Zones and fees for Sodo and outskirts; admin assigns orders to partner riders; rider phone shown to buyer (**S6**)
### M22. Rider app (1.5 weeks)
- Rider sees jobs, accepts, pickup photo, delivered photo or code, cash collection for COD orders, daily earnings

---

## Jobs and CVs (J1–J7) ✅ Done 2026-10-25
From *Sodo-Gebeya-Jobs-and-CV-Features.pdf*. Each part has its own switch and price in Admin → Features. Pages live under `/work` (`/jobs` is the hire-a-pro feature).
- **J1 Talent profile** (`/work/profile`): status, education, skills, languages, experience, the work wanted; private by default ("let employers find me" to show it in search). CVs (PDF) and certificates are private files, opened only by the owner, staff, and employers the person applied to. Deleting the profile removes its files.
- **J2 Free CV** (`/work/my-cv`): made from the profile, Modern or Simple design, English or Amharic headings, "Made with Sodo Gebeya"; saved as PDF with the browser's print.
- **J3 Job posts** (`/work/post`, `/work/employer`): first post free, then the job post price; staff check every post (Admin → Job posts) and can feature it; posts asking applicants for money are refused; deadline within 90 days.
- **J4 One-tap apply**: with the free CV or an uploaded/professional CV, limit per day, once per job; the employer sees the applicant and phone and moves them along (shortlisted, interview, hired, not selected). Interview and hired send an SMS.
- **J5 Professional CV** (`/work/cv`): three packages, express option, student discount. With online payment off, the customer pays by telebirr or bank and enters the transaction number; staff mark it paid, write, send a draft (SMS), handle changes and send the final, which is saved to the profile (Admin → CV orders). `max_open_cv_orders` pauses new orders when the team is full.
- **J6 Featured talent**: staff feature a profile for some days at the top of employers' search (off by default).
- **J7 Verified student**: student ID upload, staff approve in Admin → Students; badge on the profile and CV, and the CV discount.
- Tests: `WorkIntegrationTest` (2); browser walkthrough of the whole flow.
- Not built yet from the landing page PDF: seller plans, the invite reward and the airtime streak (they belong to M16–M17).

---

## Phase 8: Scale (ongoing)
- **M23 Security:** penetration test, rate limits everywhere, fraud rules (new account + high price + many reports), 2-step login for staff
  - Done 2026-10-26: rate limits per visitor (sign-in 20/min, changes 120/min, reads 600/min); staff 2-step sign-in (code by SMS and email, trusted device for 30 days, off by default in Admin → Features). Still to do: fraud rules, penetration test.
- **M24 Performance:** image CDN, caching, database indexes, load tests (the load-test tool already started)
- **M25 Expansion:** add towns (Areka, Boditi, Arba Minch, Hawassa) as areas; local agents; Android app in the Play Store

---

## What we reuse vs build

| Already built in TenaShop | New |
|---|---|
| BillPay payments, webhooks, sandbox/live switch | Many sellers, shops, payouts and commission |
| Products, categories, 5 photos, stock | Phone/SMS sign-in, verification, badges |
| Cart, checkout, delivery fee, discount codes | Split orders, held payments, cash on delivery, disputes |
| Order tracking, emails, payment reminders | Chat, offers, notifications by SMS/Telegram |
| Admin, roles, reports, CSV | Services: pros, jobs, quotes, deposits |
| Grafana, alerts, tests, CI | Boosts, plans, ads, languages, riders |

---

## Numbers we watch at each stage

| Stage | Watch |
|---|---|
| Phase 1 | Shops signed up, verified, listings posted |
| Phase 2 / pilot | Paid orders per week, payment success rate, disputes per 100 orders, time to payout |
| Phase 3 | Search → product → order conversion, chats that turn into orders, repeat buyers |
| Phase 4 | Jobs requested, quotes per job, jobs completed, pro rating |
| Phase 5 | Boost revenue, Pro shop subscriptions, platform income vs costs |

The Grafana Business dashboard gets a new panel for each of these as the features ship.

---

## Next step
1. You: finish Phase 0 items P0.1, P0.4 and P0.5 first (they unblock the most work).
2. Review the design canvas and comment on anything to change.
3. Say **"go M1"** and we start: rebrand and the new home screen.
