# Integration Test Plan: TenaShop × BillPay Sandbox

**Environment:** BillPay sandbox (`https://sandbox.api.billpay.et`), webhook through a public tunnel
**Related:** [BillPay notes §5](BILLPAY_INTEGRATION.md#5-sandbox-outcome-triggers) · [SRS](SRS.md)

Record for each run: date, order number, BillPay payment ID, observed result, pass/fail.

---

## A. Payment outcomes (from BillPay sandbox triggers)

| ID | Setup / customer enters | Expected payment | Expected order | Expected UI | Req |
|----|------------------------|------------------|----------------|-------------|-----|
| TC-01 | Wallet, any normal number | SUCCEEDED (seconds) | PAID, stock decremented, `order.paid` event | Success page | FR-WH, FR-EVT-2 |
| TC-02 | Card `tok_success` | SUCCEEDED | PAID | Success | FR-WH |
| TC-03 | Bank, any normal number | SUCCEEDED | PAID | Success | FR-WH |
| TC-04 | Number ending `0000` / `tok_insufficient_funds` | FAILED `INSUFFICIENT_FUNDS` | PAYMENT_FAILED | "Insufficient funds", Retry button | FR-PAY-8 |
| TC-05 | Number ending `1111` / `tok_declined` | FAILED `CUSTOMER_DECLINED` | PAYMENT_FAILED | Declined message, Retry | |
| TC-06 | Number ending `2222` | FAILED `ACCOUNT_BLOCKED` | PAYMENT_FAILED | Blocked message | |
| TC-07 | Number ending `3333` | FAILED `LIMIT_EXCEEDED` | PAYMENT_FAILED | Limit message | |
| TC-08 | `tok_expired_card` | FAILED `CARD_EXPIRED` | PAYMENT_FAILED | Card expired message | |
| TC-09 | Number ending `8888` | PENDING ~2 min, then SUCCEEDED | PENDING_PAYMENT → PAID | "Confirming…" then updates to Success without a manual refresh | FR-REC-4 |
| TC-10 | Number ending `9999` / `tok_timeout` | PENDING → EXPIRED | EXPIRED, stock released | Expired message, can re-order | FR-REC-2, FR-ORD-2 |
| TC-11 | Click Cancel on BillPay page | CANCELLED (or stays pending → expired) | Can retry | Cancelled page with Retry | US-8 |
| TC-12 | Retry after TC-04 with a good number | Attempt A2 SUCCEEDED | PAID, 2 attempts in timeline | Success | FR-PAY-6 |

## B. Refunds

| ID | Setup | Expected |
|----|-------|----------|
| TC-20 | Full refund of a PAID order | Refund SUCCEEDED, order REFUNDED |
| TC-21 | Partial refund (e.g. 100.00 of 1450.00) | PARTIALLY_REFUNDED, remaining refundable 1350.00 |
| TC-22 | Refund amount ending `.13` (e.g. 50.13) | Refund REFUSED `REFUND_REFUSED`, order unchanged |
| TC-23 | Refund more than the paid amount | Rejected by our API (400) without calling BillPay |
| TC-24 | Double-submit the same refund | Only one refund created (idempotency) |

## C. Robustness (our own)

| ID | Scenario | How | Expected |
|----|----------|-----|----------|
| TC-30 | Double-click "Pay" | Fire 2 requests in parallel | One BillPay payment, same checkout URL |
| TC-31 | Duplicate webhook | Replay the same webhook (admin replay or curl) | Second logged as DUPLICATE, no extra events |
| TC-32 | Invalid webhook signature | curl with a wrong signature | 401, stored with `signature_valid=false`, order unchanged |
| TC-33 | Amount mismatch | Forge a signed test webhook (WireMock/integration test) with a different amount | Order REVIEW_REQUIRED, not PAID |
| TC-34 | Webhook never arrives | Stop the tunnel and pay successfully | Reconciliation job marks it PAID within ~RECONCILE_AFTER |
| TC-35 | Kafka down | `docker compose stop kafka`, pay, restart Kafka | Webhook stored RECEIVED, then processed after restart |
| TC-36 | Backend restart mid-checkout | Kill the backend after the attempt is saved, before the BillPay response | On retry, same Idempotency-Key, no duplicate payment |
| TC-37 | Out-of-order events | Send SUCCEEDED, then PENDING | Stays SUCCEEDED |
| TC-38 | Shopper tampers with return URL | Open `/checkout/return?status=success` for an unpaid order | Shows the real status (pending/failed), not success |
| TC-39 | Price tampering | Send a modified price in the checkout request | Server uses DB prices |
| TC-40 | Out of stock | Checkout quantity > stock | 409 with item details, no BillPay call |
| TC-41 | Bad API key | Set a wrong `BILLPAY_API_KEY` | Friendly error for the shopper, detailed server log, order not left dangling |

## D. Phase 2 (payouts, not in release 1)

| ID | Setup | Expected |
|----|-------|----------|
| TC-50 | Payout to account ending `0000` | Refused |
| TC-51 | Payout to account ending `9999` | Paid, then Returned |

## E. Exit criteria

- All of A, B and C pass on the sandbox
- No unexpected ERROR-level logs during the run
- Each test's order timeline in the admin matches the expected states

---

## Results: 2026-10-23 (BillPay sandbox, automated through the real hosted checkout)

| TC | What | Result | Notes |
|----|------|--------|-------|
| 01 | Wallet, normal number | ✅ PASS | PAID in ~3 min (sandbox "a few seconds" is really ~3 min) |
| 02 | Card, normal number | ✅ PASS | PAID (TEST_CARD) |
| 03 | Bank, normal number | ✅ PASS | PAID (TEST_BANK) |
| 04 | Wallet …0000 | ✅ PASS | Order stays unpaid, reason INSUFFICIENT_FUNDS shown, can retry |
| 05 | Wallet …1111 | ✅ PASS | CUSTOMER_DECLINED |
| 06 | Wallet …2222 | ✅ PASS | ACCOUNT_BLOCKED |
| 07 | Wallet …3333 | ✅ PASS | LIMIT_EXCEEDED |
| 08 | `tok_expired_card` | ⛔ N/A | BillPay's sandbox page asks for a phone number for Card too; there is no token field |
| 09 | Wallet …8888 | ✅ PASS | PAID after ~2.5 min |
| 10 | Wallet …9999 | ✅ PASS (stage 1) | After ~20 min BillPay fails the try with `PROVIDER_TIMEOUT`; payment stays open until its 30-min expiry, then TenaShop's expiry job sets the order `EXPIRED` |
| 21 | Partial refund | ⛔ Blocked by BillPay | Endpoint found: `POST /api/v1/checkout/payments/{id}/refunds` → 422 "merchant is at its refund limit; settle or clear what is open first" |
| 23 | Over-refund | ✅ PASS | Rejected locally (400), BillPay not called |
| 31 | Duplicate webhook | ✅ PASS | Real case: webhook arrived after the status check had already marked PAID → `DUPLICATE` |
| 32 | Forged webhook | ✅ PASS | Bad signature via public URL → 401, `REJECTED`, order unchanged |
| 34 | Missing webhook | ✅ PASS | Status check (GET payment) marked orders PAID before webhooks arrived |

### Sandbox behaviour learned
- **A failed try does not fail the payment.** BillPay records the attempt as `FAILED` with a `failureCode` but keeps the payment `CREATED` so the customer can retry on the same link. TenaShop keeps the order `PENDING_PAYMENT`, stores the reason and shows "Your last try didn't go through".
- **Never-answered tries** (`…9999`) fail after ~20 min with `failureCode: PROVIDER_TIMEOUT` (not in BillPay's published table).
- **`PaymentFailed` webhooks** arrive when the whole payment fails or expires, not for each failed try.
- **`eventId` equals the paymentId**, so TenaShop deduplicates on `eventId:eventType`.

---

## Automated suite (Phase 2 P2, runs on every push)

`cd backend && ./mvnw verify`: the whole app with real Postgres + Kafka (Testcontainers) and WireMock as BillPay, replaying sandbox payloads. Never calls the real BillPay.

| Area | Scenarios | Plan TC |
|------|-----------|---------|
| Payments | Checkout sends key, idempotency key, server-side total, https return link → `PaymentCaptured` webhook → PAID, stock committed | 01 |
| | Same webhook again → acknowledged as duplicate, applied once | 31 |
| | Forged, unsigned and tampered webhooks → 401 and REJECTED; the genuine one afterwards is still applied | 32 |
| | Failed try (`INSUFFICIENT_FUNDS`) keeps the order open with the reason; status check then finds it paid with no webhook; late webhook → DUPLICATE | 04, 34 |
| | Webhook with the wrong amount → REVIEW_REQUIRED, stock untouched | 33 |
| | BillPay down (503) → order kept, 502 to shopper; retry reuses the same Idempotency-Key | |
| | Unpaid order expires → stock released, can't be paid | 10 |
| | Guests need the checkout phone to see an order | |
| | Cart over stock → 409, BillPay not called | |
| Refunds | Over-refund → 400 locally, BillPay not called; BillPay 422 refund limit → refund REFUSED with the reason | 21, 23 |
| Accounts | Guest / customer / support / admin access; weak password; 5 wrong passwords lock; log out everywhere; disabled staff lose access at once; unknown route → 404 | |
| Catalog | Hide product / category; photos resized, served, reordered, max 5; fake and tiny images refused; stock can't go below held units; duplicate; change history; unique slugs | |
| Delivery (P3) | Fee added below 3,000 ETB and charged through BillPay, free above; address required; paid order → processing → shipped (rider note) → delivered, no going back; unpaid orders can't be fulfilled; support can't change delivery; customer cancels unpaid order (stock returns, can't be paid); payment after cancel → REVIEW_REQUIRED; address book (default, no duplicates, staff refused) | |
| Emails (P4) | Order placed → paid → on the way (rider note) → delivered, read from a real Mailpit inbox; BillPay re-delivery sends no second email; names HTML-escaped; payment failed (reason) and cancel emails; same Kafka event twice → one email; password change email; admin email log | |
| Reports (P6) | Revenue per day, top products, success by method, failure reasons; orders and payments CSV (BillPay ids, formula-safe cells, phone numbers kept); staff only | |
| Monitoring (P2b) | `/actuator/prometheus` refused through a proxy; payment, BillPay, webhook and order metrics move after a paid checkout | |

Bugs these tests found (fixed): a forged webhook sent before the genuine one made the genuine one look like a duplicate; every missing route returned 403 instead of 404.

---

## Results: 2026-10-23 (Phase 2 P1, catalog management)

API run: **47 / 47 checks passed**. Browser run (create → 3 photos → main photo → restock → store gallery): passed, no page errors.

| Area | Checked | Result |
|------|---------|--------|
| Photos | Upload, resize (1200 px + 400 px thumb), serve, reorder, make main, remove; 6th photo refused | ✅ PASS |
| Photo validation | Non-image renamed `.jpg` → 400; file over 5 MB → 413 `FILE_TOO_LARGE` | ✅ PASS |
| Stock | Add / remove with reason; removing below units held by unpaid orders → 409 `BELOW_RESERVED`; low-stock and sold-out badges | ✅ PASS |
| Hide / show | Hidden product 404s in the store, stays in admin; hiding a category hides its products | ✅ PASS |
| Duplicate | Copy is hidden, stock 0, photos copied in storage | ✅ PASS |
| History | Each change recorded with field diff and staff email | ✅ PASS |
| Roles | Support can view but not edit or upload (403); guests 401 | ✅ PASS |
| Unit tests | `ImageProcessorTest`, `SlugsTest` (24 backend unit tests in total) | ✅ PASS |
