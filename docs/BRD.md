# Business Requirements Document (BRD)

**Project:** TenaShop: BillPay Integration Test Store
**Merchant:** TenaPay (BillPay merchant account)
**Version:** 0.1 (draft) · **Date:** 2026-10-22

---

## 1. Background

TenaPay has a BillPay merchant account, currently in **Test (sandbox) mode**. Before going live, TenaPay needs to prove that a real online store can:

- take payments through BillPay hosted checkout,
- react correctly to every payment outcome (success, refusal, delay, timeout),
- stay consistent when callbacks are late, duplicated or missing,
- issue refunds.

BillPay will only issue live keys after merchant verification (dashboard shows *Verification 0%, 13 details left*). A working, tested integration is also what TenaPay will show during go-live sign-off.

## 2. Business objectives

| # | Objective | Measure of success |
|---|-----------|--------------------|
| BO-1 | Validate the BillPay checkout integration end to end | 100% of sandbox scenarios in [TEST_PLAN.md](TEST_PLAN.md) pass |
| BO-2 | Build a reusable integration module | The BillPay client and webhook handling can be lifted into other TenaPay products |
| BO-3 | Be ready for go-live | Moving from sandbox to live needs only config changes (API key and base URL) |
| BO-4 | Show a credible customer experience | Modern landing page, catalog, cart and checkout that can be demoed |
| BO-5 | Make reconciliation possible | Every order maps to its BillPay payment and its webhook history |

## 3. Scope

### In scope
- Public storefront: landing page, product catalog, cart, guest checkout
- Payment through **BillPay Hosted Checkout** (Wallet, Bank, Card)
- Webhook (callback) handling and payment status reconciliation
- Order status page for customers
- Admin back-office: orders, payments, webhook log, refunds
- Sandbox test tooling (scenario cheat sheet)
- Dockerized local environment

### Out of scope (phase 1)
- Real shipping and logistics, tax engine
- Customer accounts and login (guest checkout only)
- BillPay **payouts/withdrawals**, which are planned for phase 2
- Production hosting and scaling
- Multi-currency (ETB only)

## 4. Stakeholders

| Role | Interest |
|------|----------|
| TenaPay owner (Abel) | Working integration, go-live readiness |
| Developer(s) | Clear specs and a test matrix |
| BillPay integration/support team | Answers to open API questions, UAT sign-off |
| End customer (simulated) | Smooth, trustworthy checkout |

## 5. Business rules

- **BR-1** An order counts as paid **only** after BillPay confirms it, by a verified webhook or a status query. A browser redirect is never proof of payment.
- **BR-2** The amount BillPay confirms must equal the order total. A mismatch is flagged and never auto-fulfilled.
- **BR-3** A customer must never be charged twice for one order. Every payment attempt carries an idempotency key.
- **BR-4** Orders unpaid after the payment expiry window move to **EXPIRED** and release their stock.
- **BR-5** Only admins can refund. A refund can't exceed the amount paid.
- **BR-6** Currency is **ETB**.
- **BR-7** The API key is a secret. It stays on the server and is never sent to the browser.

## 6. Assumptions and constraints

- BillPay sandbox is reachable at `https://sandbox.api.billpay.et`.
- BillPay must be able to reach the webhook URL, so local development needs a public tunnel.
- Some API details (webhook signature, status endpoint, refund endpoint) are still unconfirmed. See [BILLPAY_INTEGRATION.md §6](BILLPAY_INTEGRATION.md#6-open-questions-for-billpay).
- An IP whitelist exists in the BillPay dashboard and may restrict which IPs can call the API.

## 7. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Incomplete BillPay docs | Delays, rework | Isolate BillPay behind one client/adapter and keep the open-questions list current |
| Webhooks not delivered locally | Can't test callbacks | ngrok/cloudflared plus a status-poll fallback |
| IP whitelist blocks dev machine | API calls rejected | Whitelist the dev public IP and document it |
| Sandbox behaves differently from live | Go-live surprises | Keep env-specific config and smoke-test live with a small amount |
