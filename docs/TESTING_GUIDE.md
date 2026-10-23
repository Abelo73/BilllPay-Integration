# Testing Guide: TenaShop × BillPay Sandbox

Step by step, from a fresh machine to every test case in [TEST_PLAN.md](TEST_PLAN.md).
Commands are for **PowerShell** on Windows. Use `curl.exe`, not `curl`, which PowerShell aliases to something else.

**Contents**
- Part 1: One-time setup
- Part 2: Start everything
- Part 3: Smoke check (5 minutes)
- Part 4: Connect BillPay webhooks
- Part 5: Your first payment
- Part 6: Payment outcome tests (TC-01 to TC-12)
- Part 7: Refund tests (TC-20 to TC-24)
- Part 8: Robustness tests (TC-30 to TC-41)
- Part 9: Troubleshooting
- Results sheet

Screenshots of every screen are in [screenshots/](screenshots/).

---

## Part 1: One-time setup

### 1.1 Install the tools
| Tool | How | Check |
|------|-----|-------|
| Docker Desktop | https://www.docker.com/products/docker-desktop/ (restart if asked) | `docker version` |
| ngrok | `winget install ngrok.ngrok`, then `ngrok config add-authtoken <token from ngrok dashboard>` | `ngrok version` |
| Java 21, Node 20+, pnpm | already installed | `java -version`, `pnpm -v` |

### 1.2 Fill in `.env` (repo root)
| Variable | Where it comes from |
|----------|--------------------|
| `BILLPAY_API_KEY` | BillPay dashboard (Test mode) → **Developers → API keys → Regenerate**. It is shown **once**, so copy it right away. |
| `BILLPAY_WEBHOOK_SECRET` | Filled in Part 4 |
| `ADMIN_PASSWORD` | Choose one. You use it to log in to `/admin`. |

Leave everything else as it is.

---

## Part 2: Start everything

Open four terminals in the repo folder.

```powershell
# Terminal 1: Postgres, Kafka, Kafka UI
docker compose up -d postgres kafka kafka-ui
docker compose ps          # wait until postgres and kafka show "healthy"

# Terminal 2: backend (first run downloads dependencies)
cd backend; .\mvnw.cmd spring-boot:run
# ready when you see: "Started TenashopApplication"

# Terminal 3: frontend
cd frontend; pnpm install; pnpm dev
# ready when you see: Local: http://localhost:5280/

# Terminal 4: public tunnel for BillPay webhooks
ngrok http --url=vocalize-porridge-cogwheel.ngrok-free.dev 8181
```

| Open | What you should see |
|------|---------------------|
| http://localhost:5280 | The store landing page, with featured products loaded |
| http://localhost:5280/admin | Admin login |
| http://localhost:8191 | Kafka UI with topics `billpay.webhook-events` and `orders.events` |
| http://localhost:8181/swagger-ui.html | Backend API docs |

---

## Part 3: Smoke check (5 minutes)

```powershell
curl.exe http://localhost:8181/actuator/health
# expect "status":"UP", with db and kafka UP

curl.exe http://localhost:8181/api/categories
# expect 5 categories

curl.exe https://vocalize-porridge-cogwheel.ngrok-free.dev/actuator/health
# expect the same JSON through the tunnel
```

Then log in at **/admin** (username `admin`, plus your `ADMIN_PASSWORD`) and open **BillPay setup**:
- ✅ API key shows `BPG_TEST-…xxxx`
- 🟡 Webhook secret: not set yet. That's expected until Part 4.

---

## Part 4: Connect BillPay webhooks

1. BillPay dashboard (Test mode) → **Developers → Webhooks → Add endpoint**
   - Endpoint URL: `https://vocalize-porridge-cogwheel.ngrok-free.dev/api/webhooks/billpay`
   - Description: `TenaShop local`
2. **Copy the secret immediately.** BillPay shows it only once. Paste it into `.env` as `BILLPAY_WEBHOOK_SECRET=...`.
3. Restart the backend (Ctrl+C in terminal 2, then run it again).
4. In BillPay, click **send a test delivery**.
5. In TenaShop **Admin → Webhooks**, a new row should appear with status `IGNORED` (test delivery). Click it:
   - The **Signature** box shows, for example, `probe: header 'X-…-Signature' = hmac-sha256 over raw body`.
   - It may show `probe: no match` instead. In that case, send me a screenshot of the headers and payload, and I'll add BillPay's format.
6. Turn on enforcement in `.env`, then restart the backend:
   ```
   BILLPAY_WEBHOOK_SIGNATURE_HEADER=<the header name from step 5>
   BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256
   ```
7. Send another test delivery. The **Sig** column should now show a green shield ✅.

> Also check **Developers → IP whitelist** in BillPay. If API calls fail with 401/403 even though the key is correct, add your public IP there.

---

## Part 5: Your first payment

1. Store → **Shop** → add **Sandbox Test Item** (ETB 10) → open the cart → **Checkout**.
2. Fill in name, phone `0911 234 567` and email → **Pay with BillPay**.
3. You are taken to BillPay's hosted checkout page. Choose **Test Wallet** and enter any normal number, e.g. `0911 234 567`.
4. BillPay sends you back to `/checkout/return`. You see **"Confirming your payment…"**, and within a few seconds **"Payment confirmed"**.
5. Check the admin:
   - **Orders** → your order is `PAID`.
   - Open it: in **Payments**, the request/response JSON is shown; in **Webhooks**, the `captured` event appears as `PROCESSED`; the **Timeline** reads created → payment requested → paid.
   - **Kafka UI** → `orders.events` contains an `order.paid` message.

📸 **Send me screenshots of the order's Payments and Webhooks tabs.** That gives me BillPay's real field names (open questions Q1/Q2).

If step 2 fails with "couldn't reach the payment provider", go to Part 9.

---

## Part 6: Payment outcome tests (TC-01 to TC-12)

For each row: place an order with the Sandbox Test Item, then on BillPay's page enter the value shown.

| TC | On BillPay enter | Store page shows | Admin order status | Notes |
|----|------------------|------------------|--------------------|-------|
| 01 | Test Wallet, any normal number | Payment confirmed | `PAID` | |
| 02 | Test Card, token `tok_success` | Payment confirmed | `PAID` | |
| 03 | Test Bank, any normal number | Payment confirmed | `PAID` | |
| 04 | Number ending `0000` (or `tok_insufficient_funds`) | "not enough balance", **Try paying again** | `PAYMENT_FAILED` | Attempt shows `INSUFFICIENT_FUNDS` |
| 05 | Number ending `1111` (or `tok_declined`) | "declined" | `PAYMENT_FAILED` | `CUSTOMER_DECLINED` |
| 06 | Number ending `2222` | "account is blocked" | `PAYMENT_FAILED` | `ACCOUNT_BLOCKED` |
| 07 | Number ending `3333` | "over your account limit" | `PAYMENT_FAILED` | `LIMIT_EXCEEDED` |
| 08 | Card token `tok_expired_card` | "card has expired" | `PAYMENT_FAILED` | `CARD_EXPIRED` |
| 09 | Number ending `8888` | "Confirming…" for about 2 min, then **Payment confirmed** by itself | `PENDING_PAYMENT` → `PAID` | Leave the page open; don't refresh |
| 10 | Number ending `9999` (or `tok_timeout`) | Stays "Confirming…", then **Payment window closed** | `EXPIRED` | Takes up to `PAYMENT_EXPIRY` (30 min). Set `PAYMENT_EXPIRY=PT3M` in `.env` to test faster. Stock is released. |
| 11 | Click **Cancel** on BillPay's page | **Payment cancelled** + **Continue payment** | stays `PENDING_PAYMENT` | Continue payment reopens the same checkout |
| 12 | Do TC-04, then click **Try paying again** and use a normal number | Payment confirmed | `PAID` | The order shows 2 attempts: A1 FAILED, A2 SUCCEEDED |

The **Admin → Dashboard** "Failed payments by reason" chart fills up as you go.

---

## Part 7: Refund tests (TC-20 to TC-24)

Use an order that is `PAID` (for example, buy 2 × Yirgacheffe = ETB 1,300). Open it in **Admin → Orders**, then click **Refund** on the successful attempt.

| TC | Do | Expect |
|----|----|--------|
| 20 | Refund the full amount | Refund `SUCCEEDED` (maybe `PENDING` until BillPay's "refunded" webhook arrives). Order becomes `REFUNDED`. |
| 21 | New paid order: refund `100.00` | Order becomes `PARTIALLY_REFUNDED`; Refundable drops by 100 |
| 22 | Refund `50.13` | Refund `REFUSED` with `REFUND_REFUSED`; order unchanged |
| 23 | Refund more than the Refundable amount | Error "Refund must be between 0.01 and …". BillPay is **not** called. |
| 24 | Double-click **Refund** quickly | Only one refund row is created |

> The refund endpoint path is our best guess (`/api/v1/refunds`). If TC-20 shows `REFUSED` with `REJECTED_HTTP_404`, the path is wrong. Send me the BillPay refund API doc or a screenshot of the error and I'll fix it.

---

## Part 8: Robustness tests (TC-30 to TC-41)

| TC | Scenario | How | Expect |
|----|----------|-----|--------|
| 30 | Double-click Pay | Press **Pay with BillPay** twice fast | One order, one BillPay payment |
| 31 | Duplicate webhook | Admin → Webhooks → open a `PROCESSED` event → **Replay through Kafka** | New status `DUPLICATE`; order unchanged |
| 32 | Forged webhook (needs Part 4 step 6) | `curl.exe -X POST https://vocalize-porridge-cogwheel.ngrok-free.dev/api/webhooks/billpay -H "Content-Type: application/json" -H "X-BillPay-Signature: fake" -d "{\"status\":\"PAID\"}"` | HTTP **401**; row with red shield, `REJECTED` |
| 34 | Webhook never arrives | Stop ngrok, then pay successfully | Return page still turns **Payment confirmed** (it asks BillPay directly). The background job also fixes it after about 3 min. ⚠️ This relies on BillPay's status endpoint (Q5). |
| 35 | Kafka down | `docker compose stop kafka`, pay, wait 1 min, `docker compose start kafka` | Webhook stays `RECEIVED`, then becomes `PROCESSED` after restart (sweeper) |
| 36 | Backend crash mid-payment | Click Pay and immediately Ctrl+C the backend; restart it; open **Track order** → Try paying again | Same Idempotency-Key reused (see attempt), no duplicate payment |
| 38 | Fake success link | Open `http://localhost:5280/checkout/return?order=<an unpaid order>&status=success` | Page shows the **real** status, not success |
| 39 | Price tampering | In browser DevTools, change a price in localStorage `tenashop-cart` and check out | BillPay is charged the **database** price |
| 40 | Out of stock | Buy 21 units (UI caps at 20), or set a product's stock low in the DB | Error, and BillPay is not called |
| 41 | Wrong API key | Set a wrong `BILLPAY_API_KEY`, restart, check out | Friendly error; the order is saved and can be paid later from Track order |

---

## Part 9: Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Store shows "Products could not be loaded" | Backend not running | Check terminal 2 |
| Backend fails: `Connection refused ... 5544` | Postgres not up | `docker compose up -d postgres` and wait for healthy |
| Backend fails: `Unsigned webhooks are only allowed against the BillPay sandbox` | Live URL with verification NONE | Set up Part 4 first |
| "couldn't reach the payment provider" at checkout | Bad API key, IP not whitelisted, or wrong request shape | Admin → Orders → open order → Payments → read **Response from BillPay** / error |
| Paid on BillPay but order stays pending | Webhook not reaching us | Check the ngrok terminal for `POST /api/webhooks/billpay`; check BillPay's **Recent deliveries**; check Admin → Webhooks |
| Webhook rows are `IGNORED` with "No payment attempt matches" | BillPay uses different field names | Send me the payload screenshot (Q2) |
| Port already in use | Something else is on 5544/8181/8191/29492/5280 | Change it in `.env` (all ports are configurable) |

**Useful commands**
```powershell
docker compose logs -f kafka            # Kafka logs
docker compose down                     # stop infra (data kept)
docker compose down -v                  # stop and wipe the database (fresh start)
```

---

## Results sheet

Copy this into a file or spreadsheet and fill it in as you test:

| TC | Date | Order # | BillPay payment id | Result | Notes |
|----|------|---------|--------------------|--------|-------|
| 01 | | | | ☐ pass ☐ fail | |
| 04 | | | | ☐ pass ☐ fail | |
| … | | | | | |
