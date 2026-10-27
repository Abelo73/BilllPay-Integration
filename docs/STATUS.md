# Where we are (27 Oct 2026)

One page: what works, what's being built, what's left, and **what you do next**. Details per feature are in
[MARKETPLACE_ROADMAP.md](MARKETPLACE_ROADMAP.md); BillPay facts are in [BILLPAY_INTEGRATION.md](BILLPAY_INTEGRATION.md).

---

## 1. Do these next (in order)

| # | What | Why | How |
|---|------|-----|-----|
| 1 | **Restart WSL** | It stopped answering; backend and frontend are down | PowerShell: `wsl --shutdown`, open WSL, `scripts/dev.sh` (about 2 min) |
| 2 | **Try the BillPay lab** | New today; see exactly how BillPay behaves | Admin → **BillPay lab** → Sandbox, 10 ETB → Create → Open checkout → pay → watch calls and webhooks |
| 3 | **Refund the live test orders** | Real money (TS-20261027-00065: 1,600 ETB, TS-20261027-00067: 6,900 ETB) | Admin → order → Payments → Refund. It shows **Pending · BillPay: under review** |
| 4 | **Ask the BillPay team** | Refunds stay "under review" | Who approves refunds and how long; what the refund webhook looks like (see §5) |
| 5 | **Decide about favourites** | An ended session left 20 uncommitted files (hearts, share, area, V34) | Finish and commit them, or remove them (ask Claude) |
| 6 | **Switch to Sandbox while testing** | Admin shows LIVE mode; online payment is on | Admin → BillPay setup → Sandbox |

---

## 2. What works

**Marketplace (Sodo Gebeya)**

| Area | State |
|------|-------|
| Sign in with phone (SMS code) or email | ✅ SMS reaches verified numbers only while AfroMessage is in beta |
| Sellers, shops, Verified badge, listing reports | ✅ |
| Products with category details (brand, storage, size…), photos, areas | ✅ |
| Search, price filters, saved searches with alerts | ✅ |
| Chat with offers / counter-offers | ✅ |
| Cart → one parcel per seller → BillPay checkout | ✅ |
| Delivery fee per area of Sodo, riders, rider shown to buyer | ✅ |
| Cash on delivery | 🟡 Built (M7), tests not run yet |
| Protected payments, commission, seller balance, payouts | ✅ |
| Problems/disputes; refunds by buyer, seller or staff | ✅ |
| Notifications (bell), SMS choices, order SMS | ✅ |
| Reviews and ratings | ✅ |
| Hire a pro: profiles, job requests, quotes | ✅ |
| Jobs & CVs: profiles, free CV, job board, CV service | ✅ |
| Boosts, Pro shop plan, home banners | ✅ |
| Amharic (whole customer + seller site, SMS) | ✅ needs a native speaker's review |
| Telegram bot | 🟡 built; needs your bot token |
| Installable app | 🟡 push notifications missing |

**BillPay**

| Part | State |
|------|-------|
| Create payment, hosted checkout, return page | ✅ live payment tested: paid in 23 s |
| Webhooks with signature check, stored before processing, no double-processing | ✅ |
| Status check when a webhook is missing, reminder before the 30-min expiry | ✅ |
| Sandbox / live switch in Admin | ✅ |
| Refunds | ✅ fixed 27 Oct: body is `{amount, reason}` only; BillPay answers `UNDER_REVIEW` |
| **BillPay lab** (Admin) | 🟡 new 27 Oct; type-checked, backend test written but not run (WSL was down) |
| Monitoring: Grafana dashboards, alerts, uptime | ✅ |

**Dev setup**: `scripts/dev.sh` builds the backend on the Linux side (≈2 min instead of 7–10);
`scripts/dev.sh quick` restarts without rebuilding (for `.env` changes); `scripts/dev.sh check` runs the checks.

---

## 3. What's left to build

| # | Feature | Notes |
|---|---------|-------|
| 1 | Pay the price agreed in chat | Offer accepted in chat → checkout at that price |
| 2 | M15 job deposits | Customer pays a deposit; pro paid when the job is done |
| 3 | M22 rider app | Riders see jobs, mark picked up / delivered, record cash |
| 4 | Favourites ❤️, share, price-drop alerts | Half done by an ended session (see §1.5) |
| 5 | Push notifications; Wolaytta | |
| 6 | BillPay: refund webhook, payouts API, integration report for your team | Needs answers from BillPay |
| 7 | Before launch: security test, image CDN, server, backups | |

---

## 4. Needs you (not code)

- **AfroMessage**: take the account out of beta; get the "SodoGebeya" sender name approved.
- **Telegram**: create a bot with @BotFather and a channel; put the 4 values in `.env`.
- **Amharic**: a native speaker to read `frontend/src/locales/am/`.
- **Real data**: the list of Sodo areas and delivery fees (Admin → Areas), your first riders (Admin → Riders), first 20 shops and 10 pros.
- **Launch**: domain, trade licence and TIN, legal pages (terms, privacy, seller agreement), a server.
- **Security**: tokens and passwords were pasted in chat; make new ones before going live (AfroMessage token,
  `ADMIN_PASSWORD`, `JWT_SECRET`, BillPay live key).

---

## 5. Open questions for BillPay (you work there now)

1. Refunds: who moves `UNDER_REVIEW` to done, how long, and the refund webhook (event name and body).
2. Is `reason` required on refunds? Can a merchant send its own refund reference?
3. Webhook retries: how many, how often, which answers count as success; signature timestamp tolerance.
4. Is there a payouts API (to pay sellers)?
5. How long a pending checkout lives; is `merchantReference` unique per payment or per order?
6. Idempotency-Key: how long it's kept; the answer when it's reused with a different body.
7. Return URL: does it get the payment id and status, and is it signed?
8. Can a merchant limit or pre-select payment methods (wallet, bank, card)?
9. Amount limits, rate limits, the live base URL and the go-live checklist.
