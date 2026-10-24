# Sodo Marketplace: Business and Product Plan

**Draft for review, 2026-10-24.** Nothing here is built yet. Read it, change what you disagree with, then say "go" and we build in the order of section 11.

> Working name: **Sodo Gebeya** ("Sodo market"). Check that the name is free before registering it (there is already a company called "Gebeya" in Ethiopia). Other options: *Wolaita Market*, *SodoHub*, *Sodo Shop & Services*.

---

## 1. The idea in one paragraph

One website (and later a phone app) where **anyone in Wolaita Sodo can buy, sell and hire**:
- **Shops** sell new goods: clothes, shoes, electronics, furniture, food, cosmetics.
- **People** sell used items: a phone, a sofa, a motorbike.
- **Skilled workers** offer services: electricians, plumbers, tailors, carpenters, painters, tutors, phone repair, cleaners.

Buyers search, **chat** with the seller, pay safely through **BillPay** (or cash on delivery), and a local rider delivers. The platform earns a small fee on each sale and job, and from sellers who pay to stand out.

**Why it can work:** today people in Sodo find goods and workers through Telegram channels, Facebook groups, word of mouth and walking around the market. Those channels have no search, no reviews, no safe payment and no delivery. We combine all four, for one city we know well, before anyone else does.

---

## 2. Who uses it

| Group | What they want | What we give them |
|---|---|---|
| **Buyers** (residents, Wolaita Sodo University students and staff, offices) | Find things fast, fair prices, not get cheated | Search by category and price, reviews, chat, safe payment, delivery |
| **Shops and traders** (Sodo market, boutiques, furniture makers) | More customers without opening a second shop | Free online shop page, orders and payments in one place, delivery |
| **Individuals** | Sell used items quickly | Post a listing in 2 minutes from a phone |
| **Skilled workers** (electricians, plumbers, tailors, tutors, ...) | Steady jobs and a good reputation | Profile with photos of past work, price list, reviews, job requests, chat |
| **Riders** (bajaj / motorbike) | Delivery work | Delivery jobs with fixed local fees |
| **Us (the platform)** | Income and trust | Fees, promotions, an admin panel to keep the market clean |

---

## 3. What the platform does

### 3.1 Buy and sell goods
- **Categories:** Clothes · Shoes · Phones & electronics · Furniture & home · Kitchen · Beauty · Kids · Food & coffee · Vehicles & parts · Building materials · Used items.
- **Two kinds of seller:** *Shop* (many products, stock, a shop page with logo) and *Individual* (a few listings, used items).
- **Listings:** up to 5 photos (already built), price in ETB, condition (new / used), neighbourhood, delivery or pickup.
- **Search and filters:** words, category, price range, new/used, neighbourhood, "delivers today".
- **Cart and checkout** (already built), with **cash on delivery** added next to BillPay.

### 3.2 Hire skilled people (services)
- **Pro profile:** skills, photos of past work, price guide ("installing a socket from 300 ETB"), working hours, area served, verified badge.
- **Job request flow:**
  1. The customer describes the job (text, photo, location, when).
  2. One or more pros send a **quote**.
  3. The customer accepts one and pays a **deposit** through BillPay (or agrees to pay cash).
  4. The pro does the job.
  5. The customer marks it **done**, and the money is released to the pro.
  6. Both leave a **review**.
- **Instant booking** for fixed-price jobs (e.g. "phone screen replacement 1,200 ETB").

### 3.3 Chat
- Buyer ↔ seller and customer ↔ pro chat inside the site: text, photos, "make an offer" button.
- Push and SMS alerts when a new message arrives (SMS through AfroMessage).
- **Safety:** warnings when someone asks to pay outside the platform; report and block buttons; staff can read reported chats only.

### 3.4 Trust and safety (the most important part)
- **Phone verification** for everyone (SMS code).
- **ID verification** for shops and pros (Fayda national ID or kebele ID, checked by staff) gives a **"Verified" badge**.
- **Reviews only after a completed order or job**, so they can't be faked.
- **Protected payment:** online payments are held until the buyer confirms delivery (or 48 h pass with no complaint), then paid out to the seller.
- **Disputes:** a "Problem with my order" button, a staff decision within 48 h, and refund through BillPay.
- **Banned items list:** weapons, drugs, stolen goods, fake documents, animals, alcohol to minors, and so on.
- Ratings, response time and "completed jobs" are shown on every profile.

### 3.5 Delivery
- **Phase 1:** the seller delivers, or a partner rider pool on a fixed fee by zone (e.g. inside Sodo town 50–100 ETB, outskirts more).
- **Phase 2:** a rider app: accept a job, pickup photo, delivered photo, cash collection for COD orders.

### 3.6 Languages and phones
- **Amharic and English** first; **Wolaytta (Wolayttatto)** next. That's a strong local advantage.
- Built **mobile-first and light**, so it works on slow connections and cheap Android phones. Installable from the browser (PWA) before building a store app.
- A **Telegram bot** for alerts and later for browsing, because people in Sodo already live on Telegram.

---

## 4. How the business makes money

Start with **low or zero fees** to attract sellers, then turn them on as volume grows.

| # | Income source | How it works | Suggested price (to test) |
|---|---|---|---|
| 1 | **Sales commission** | A % of every order paid through the site | 3–5% for shops, 0% for individuals at launch |
| 2 | **Service job fee** | A % of each job booked through the site | 5–10%, or a fixed 30–50 ETB per job |
| 3 | **Featured listings ("Boost")** | Top of search / home page for a few days | 30–100 ETB per listing per 3–7 days |
| 4 | **Shop subscription** | Free plan (up to 20 products) and a **Pro shop** plan (unlimited products, logo banner, statistics, lower commission) | 300–800 ETB / month |
| 5 | **Verified pro badge** | One-time check of ID and skills | 100–200 ETB, or free for the first 100 pros |
| 6 | **Delivery margin** | Customer pays the zone fee; the rider gets most of it | 10–20 ETB per delivery |
| 7 | **Local ads** | Banners for local businesses, banks, schools, events | Fixed monthly price |
| 8 | **Later:** promoted categories, B2B bulk orders, small-business loans with a partner bank/MFI | | |

### A simple example (assumptions to replace with real numbers)
In month 12: **1,500 paid orders** × average **1,200 ETB** = 1,800,000 ETB in sales.
- Commission at 4% → **72,000 ETB**
- 200 boosts × 50 ETB → **10,000 ETB**
- 40 Pro shops × 500 ETB → **20,000 ETB**
- 400 service jobs × 40 ETB → **16,000 ETB**
- 1,000 deliveries × 15 ETB margin → **15,000 ETB**

**≈ 133,000 ETB per month**, before costs. The point is not the exact number. It shows which levers matter: **number of orders** and **number of active sellers**.

---

## 5. Targets (suggested, to agree on)

| Stage | When | Target |
|---|---|---|
| **Pilot** | Months 1–3 | 50 shops, 30 pros, 300 registered buyers, **200 paid orders**, 50 service jobs, rating ≥ 4.3 |
| **Grow in Sodo** | Months 4–6 | 150 shops, 100 pros, 3,000 buyers, **800 orders/month**, first income from boosts and Pro shops |
| **Break even** | Months 7–12 | 1,500 orders/month, 400 jobs/month, monthly income covers running costs |
| **Expand** | Year 2 | Nearby towns (Areka, Boditi, Bele, Arba Minch, Hawassa), the rider app, the Wolaytta language |

**Numbers to watch every week** (the Grafana Business dashboard already has most of this):
- new sellers
- active listings
- orders and jobs
- payment success rate
- repeat buyers
- average rating
- disputes per 100 orders
- money held vs paid out

---

## 6. Getting the first users in Sodo

1. **Sign sellers in person first.** Walk the market with a phone, create their shop page for them, and post their first 10 products. Offer free listing and 0% commission for 3 months.
2. **Pros through associations:** electricians, tailors, carpenters. Offer the first 100 a free verification badge.
3. **Wolaita Sodo University:** student ambassadors, a "student deals" category, and delivery to campus.
4. **Telegram and Facebook:** a channel that auto-posts new listings with a link back to the site. Join and partner with the existing local buy/sell groups instead of fighting them.
5. **Launch offer:** free delivery on the first order, and a discount code (discount codes are already built).
6. **Local radio and posters** in Wolaytta and Amharic around the market, the bus station and the university.
7. **Referral:** a 50 ETB credit when a friend makes their first order.

---

## 7. Legal and business setup (check with a lawyer or accountant)
- Register the business and get a **trade licence** that covers e-commerce / online marketplace activity (Ministry of Trade and Regional Integration or the regional trade bureau).
- **TIN**, and VAT registration when turnover requires it. Ask an accountant how commission income and sellers' sales are taxed.
- **BillPay live merchant approval** (the KYC in the dashboard) and an agreement for holding funds and paying out to sellers.
- **Terms of use, seller agreement, privacy policy and prohibited items policy.** Ethiopia has a personal data protection law; follow it for phone numbers, IDs and chats.
- A business bank account for payouts.

---

## 8. Risks and how we handle them

| Risk | What we do |
|---|---|
| People don't trust paying online | Cash on delivery at launch; protected payments; visible reviews and verified badges |
| Fake sellers and scams | Phone + ID verification, payment held until delivery, report/block, fast bans |
| Chicken-and-egg (no buyers without sellers) | Sign sellers in person first; promote listings on Telegram for buyers |
| Sellers and buyers deal off-platform after chatting | Keep fees low; protection and reviews only for on-platform deals; warnings in chat |
| Slow internet, cheap phones | Light pages, compressed photos (already built), PWA, SMS alerts |
| Competitors (Telegram channels, Facebook, Jiji) | Be the **local** one: delivery, verified pros, services, Wolaytta language, real people on the phone |
| Disputes take a lot of staff time | Clear rules, photo proof at delivery, automatic release after 48 h without a complaint |

---

## 9. What we reuse from TenaShop today

Already built and tested:
- BillPay payments (with webhooks and a sandbox/live switch)
- accounts and roles, the admin panel
- products, categories and up to 5 photos per product
- cart and checkout, delivery addresses and fees
- order tracking, emails, discount codes, unpaid-order recovery
- reports and CSV export
- monitoring (Grafana, alerts) and automated tests

That's roughly **40% of the marketplace's foundations**.

**What changes or is new:**

| Area | Change |
|---|---|
| Sellers | Many sellers instead of one shop: seller sign-up, shop pages, each seller manages their own products and orders |
| Orders | One cart can hold items from several sellers, split into one order per seller |
| Money | Hold payments, then **pay out** to sellers minus commission; seller balance and payout history |
| Listings | Used items by individuals; condition, neighbourhood, "make an offer" |
| Services | Pro profiles, job requests, quotes, deposit, "job done", reviews |
| Chat | Real-time chat (WebSocket) with photos, notifications and reports |
| Trust | Phone OTP (AfroMessage), ID verification by staff, reviews, disputes |
| Search | Full-text search, filters, location by neighbourhood |
| Languages | Amharic, then Wolaytta |
| Payments | Cash on delivery option |
| Notifications | SMS (AfroMessage) and a Telegram bot |
| Mobile | PWA first, then an Android app |

---

## 10. Running costs to plan for (fill in with real quotes)
- **Server and storage:** a VPS or cloud server, database backups and photo storage.
- **Domain and SSL**, plus a professional email address.
- **SMS:** per message through AfroMessage (codes, order alerts).
- **BillPay fees** per transaction (ask BillPay for the live rate).
- **People:** 1–2 field agents to sign up sellers, one person for support and disputes, riders paid per delivery.
- **Marketing:** posters, radio spots, launch discounts, referral credits.

---

## 11. Build plan (in order; each step ends with tests and something usable)

| Step | What | Result |
|---|---|---|
| **1. Sellers** | Seller sign-up, shop pages, sellers manage their own products and see their own orders; staff approve sellers | Several real shops can sell |
| **2. Phone and trust** | SMS login codes (AfroMessage), verified badge, reviews after delivery, report listing | Buyers can tell who is trustworthy |
| **3. Money flow** | Split orders per seller, commission, held funds, seller balance and payouts; cash on delivery | The platform earns its first commission |
| **4. Search and listings** | Full-text search, filters, neighbourhoods, used items by individuals, "make an offer" | It feels like a real marketplace |
| **5. Chat** | Buyer ↔ seller chat with photos, notifications, safety warnings, reports | Deals happen inside the platform |
| **6. Services** | Pro profiles, job requests, quotes, deposit, job done, reviews | Electricians, tailors and others get jobs |
| **7. Boosts and plans** | Featured listings, Pro shop subscription, ads | More income sources |
| **8. Local touch** | Amharic and Wolaytta, Telegram bot, PWA install | Wider reach in Sodo |
| **9. Delivery** | Zones and fees, a rider pool, rider app with proof of delivery | Reliable delivery |
| **10. Go live** | Legal pages, BillPay live, security, backups, monitoring | Public launch in Sodo |

**Pilot launch** can happen after **steps 1–3 plus cash on delivery**: real shops, real orders, real commission. Steps 4–6 make it grow.

---

## 12. Decisions needed from you before we start
1. **Name** and domain (e.g. sodogebeya.com / .et).
2. **Goods first or services first?** Recommended: goods first (steps 1–3), with services right after (step 6).
3. **Commission at launch:** 0% for 3 months, or 3% from day one?
4. **Cash on delivery:** allowed at launch? (Recommended: yes, for verified sellers.)
5. **Languages at launch:** Amharic + English, or also Wolaytta?
6. **Who handles support and disputes** at the start (you, or a hired person)?
7. **Delivery at launch:** sellers deliver themselves, or a small rider group you organise?
8. **Budget** for the first 6 months (server, SMS, marketing, people).

When you're happy with this plan, say **"go"** with your answers to section 12, and we start with **Step 1: Sellers**.
