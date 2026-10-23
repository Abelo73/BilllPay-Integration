# BillPay Integration Notes

This file holds everything known about the BillPay API, with the source of each fact, plus the open questions. Update it whenever BillPay answers a question or a sandbox response shows something new.

---

## 1. Environments

| Env | API base URL | Dashboard |
|-----|-------------|-----------|
| Sandbox | `https://sandbox.api.billpay.et` | https://merchant.billpay.et (Test toggle) |
| Live | _TBC_ (probably `https://api.billpay.et`) | same dashboard, Live toggle |

Live keys are issued only after merchant verification is approved (dashboard currently shows *Verification 0%*).

## 2. Authentication

- Header `x-api-key: <API key>`
- Test keys look like `BPG_TEST-…`. The dashboard shows a key in full **only once**, when it is issued. Use **Regenerate** to get a copyable one.
- Keys are managed in **Dashboard → Developers → API keys**.
- ⚠️ The dashboard's own login/hand-off JWTs (`/sandbox-sessions`, `/sandbox-handoffs`) are **not** for merchant integration. Never use them in the app.

## 3. Create payment (hosted checkout)

Source: Dashboard → Developers → "Take a payment".

```http
POST /api/v1/checkout/payments
Host: sandbox.api.billpay.et
x-api-key: BPG_TEST-...
Content-Type: application/json
Idempotency-Key: 6f1c2c1e-...-uuid

{
  "merchantReference": "INV-2261",
  "amount": 1450.00,
  "currency": "ETB",
  "description": "Invoice INV-2261",
  "customer": {
    "name": "Abebe Kebede",
    "phone": "+251911204471",
    "email": "abebe@example.et"
  },
  "returnUrl": "https://example.et/paid",
  "cancelUrl": "https://example.et/cancelled"
}
```

**Documented behavior:** "Your server calls this with your API key and gets back a checkout URL for the customer."

**Expected response envelope** (based on other BillPay endpoints, which all use this shape):
```json
{
  "statusCode": 200,
  "message": "...",
  "body": { /* payment id, checkoutUrl, status, expiresAt ... (TBC) */ },
  "timestamp": "2026-10-22T18:06:25.627+00:00"
}
```
➡️ **Action:** make one real sandbox call and record the exact `body` fields here.

## 4. Sandbox payment methods

| Method | Code |
|--------|------|
| BillPay Test Wallet | `TEST_WALLET` |
| BillPay Test Bank | `TEST_BANK` |
| BillPay Test Card | `TEST_CARD` |

Card tokens stand in for a card entered on the hosted page. **Never enter a real card number in the sandbox.**

## 5. Sandbox outcome triggers

Source: Dashboard → Developers → "Testing in the sandbox".

| Customer enters | Outcome | Reason code |
|-----------------|---------|-------------|
| Any other number, or `tok_success` | Paid after a few seconds | — |
| Number ending `0000`, or `tok_insufficient_funds` | Refused | `INSUFFICIENT_FUNDS` |
| Number ending `1111`, or `tok_declined` | Refused | `CUSTOMER_DECLINED` |
| Number ending `2222` | Refused | `ACCOUNT_BLOCKED` |
| Number ending `3333` | Refused | `LIMIT_EXCEEDED` |
| `tok_expired_card` | Refused | `CARD_EXPIRED` |
| Number ending `8888` | Paid after **two minutes** | — |
| Number ending `9999`, or `tok_timeout` | Never answered: stays pending, then expires | — |
| Refund whose amount ends in `.13` | Refund refused | `REFUND_REFUSED` |
| Payout to account ending `0000` | Refused | — |
| Payout to account ending `9999` | Paid, then **returned** | — |

## 5a. Webhooks

Source: Dashboard → Developers → Webhooks (screenshots, 2026-10-22).

- "BillPay sends **signed** events (**payment captured, failed, refunded, settled**) to your endpoints."
- Endpoints can be added in the dashboard **or through the API**. Each has a URL and an optional description.
- The signing secret is **shown once**, when the endpoint is created.
- The dashboard can **send a test delivery** and lists **recent deliveries** ("follow what BillPay sent").

**How TenaShop handles this**
- Endpoint: `POST {public URL}/api/webhooks/billpay`. Locally, use an ngrok tunnel to port 8181.
- Each delivery is stored (headers + raw body) **before** processing, then processed through Kafka.
- Routing by event type: `*captured*` → payment SUCCEEDED, `*failed*` → FAILED, `*refund*` → refund module, `*settle*` → timeline note only, `*test*` → logged and ignored.
- **Signature scheme discovery (Q3):** with `BILLPAY_WEBHOOK_SECRET` set and `BILLPAY_WEBHOOK_VERIFICATION=NONE`, every delivery is *probed*. The backend tries HMAC-SHA256 (hex/base64, `sha256=` prefix, `t=…,v1=…`, separate timestamp header) against every signature-like header, then records which one matched. You can see the result in Admin → Webhooks → open event → *Signature*. Then set `BILLPAY_WEBHOOK_SIGNATURE_HEADER` and `BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256`.

## 6. Open questions for BillPay

Get these from the docs or the integration team before building the affected parts:

| # | Question | Blocks |
|---|----------|--------|
| Q1 | ✅ **Answered 2026-10-23** (real sandbox call): HTTP 201, `body.id` (UUID), `body.checkoutUrl`, `body.status` = `CREATED`, `body.expiresAt` (30 min), money as `{"amount": 10.0000, "currency": "ETB"}` objects (`amount`, `charged`, `fee`, `vat`, `net`, `refunded`). `returnUrl`/`cancelUrl` **must be https**. Bad key → 401 `"Invalid API key"`. | FR-PAY-4 |
| Q2 | ✅ **Answered 2026-10-23:** body `{eventId, eventType, occurredAt, data:{paymentId, merchantReference, amount, chargedAmount, fee, vat, netAmount, currency, provider, instrument, capturedAt, attemptStartedAt}}`; headers `X-Billpay-Event`, `X-Billpay-Event-Id`. No status field: the type (`PaymentCaptured`, …) carries it. ⚠️ `eventId` equals the paymentId, so we dedupe on `eventId:eventType`. | FR-WH |
| Q3 | ✅ **Answered 2026-10-23:** `X-Billpay-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`, secret `whsec_…` per endpoint (Test and Live separate). Verified live: real delivery matched, forged one got 401. Still open: BillPay's timestamp tolerance (we don't enforce one yet). | FR-WH-2 |
| Q4 | Webhook retry policy: how many retries, backoff, which response codes count as success | FR-WH-5 |
| Q5 | ✅ **Answered 2026-10-23:** `GET /api/v1/checkout/payments/{id}` (UUID) works with `x-api-key`. Statuses seen: `CREATED` → `PROCESSING`. Per-try details live in `attempts[]` (`instrument`, `payerReference`, `status`, `failureCode`, `failureReason`). Lookup by merchantReference still unknown. | FR-REC |
| Q6 | Refund endpoint and body (we assume `POST /api/v1/refunds` with paymentId, merchantReference, amount, currency, reason; configurable as `billpay.refund-path`), and partial refunds. Refund **webhooks** are confirmed ("refunded" events). | FR-REF |
| Q7 | How long a pending checkout lives before it expires | FR-REC-2 |
| Q8 | Must `merchantReference` be unique per payment or per order? Can it be reused after failure? | FR-PAY-6 |
| Q9 | Idempotency-Key retention window, and the response when a key is replayed with a different body | FR-PAY-3 |
| Q10 | IP whitelist: does it restrict **our** outbound API calls? What are BillPay's webhook source IPs? | Ops |
| Q11 | Are `returnUrl`/`cancelUrl` given query params (payment ID, status)? Are they signed? | Return page |
| Q12 | Can we pre-select or restrict the payment method in the request (Wallet/Bank/Card)? | Checkout UX |
| Q13 | Amount precision and format (number vs string), min/max amount | Validation |
| Q14 | Rate limits | Client config |
| Q15 | Live base URL and go-live (UAT) checklist | Go-live |

## 7. Dashboard areas worth checking

- **Developers → Webhooks**: register `APP_WEBHOOK_PUBLIC_URL` and get the secret (answers Q2/Q3)
- **Developers → IP whitelist**: add your public IP if API calls are rejected
- **Developers → Checkout settings**: branding and allowed methods (Q12)
- **Payment methods** (`/payment-methods`): which methods are enabled for the merchant
- **Transactions / Refunds / Settlements**: cross-check our records during testing

## 8. Change log

| Date | Change |
|------|--------|
| 2026-10-22 | Initial notes from dashboard screenshots (Developers page, sandbox table) |
| 2026-10-22 | Webhooks page: signed events (captured/failed/refunded/settled), secret shown once, test deliveries, delivery log |
| 2026-10-23 | First real sandbox payment end to end (TS-20261023-00003, ETB 1,450, TEST_WALLET): create 201 → checkout → PaymentCaptured webhook (signature verified) → order PAID. Q1, Q2, Q3, Q5 answered. |
