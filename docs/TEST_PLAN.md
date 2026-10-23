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
