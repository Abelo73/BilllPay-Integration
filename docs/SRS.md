# Software Requirements Specification (SRS)

**System:** TenaShop
**Version:** 0.1 (draft) · **Date:** 2026-10-22
**Related:** [PRD](PRD.md) · [TRD](TRD.md) · [BillPay notes](BILLPAY_INTEGRATION.md)

---

## 1. Introduction

### 1.1 Purpose
This document gives the functional and non-functional requirements of TenaShop in testable form. Each requirement has an ID that tests and code can reference.

### 1.2 Definitions
| Term | Meaning |
|------|---------|
| **Order** | A shopper's purchase: items, total and customer contact |
| **Payment attempt** | One call to BillPay *create payment* for an order. An order may have several (retries). |
| **merchantReference** | Our reference sent to BillPay to identify a payment attempt |
| **Idempotency-Key** | A UUID per payment attempt that makes the create call safe to retry |
| **Webhook** | HTTP callback from BillPay telling us a payment status changed |
| **Reconciliation** | Asking BillPay for a payment's status when we lack a final answer |
| **Final status** | SUCCEEDED, FAILED, EXPIRED or CANCELLED |

### 1.3 System context
```
Browser (React) ──HTTPS──► Backend (Spring Boot) ──HTTPS──► BillPay API
                                │   ▲                        │
                                │   └──── webhook ◄──────────┘
                                ▼
                   PostgreSQL     Kafka ──► internal consumers
```

---

## 2. Functional requirements

### 2.1 Catalog (FR-CAT)
- **FR-CAT-1** The system shall list active products with pagination, a category filter, name search and sorting by price or newest.
- **FR-CAT-2** The system shall show product detail by slug: name, description, images, price (ETB, 2 decimals), stock.
- **FR-CAT-3** Admins shall be able to create, update and deactivate products and adjust stock.

### 2.2 Cart (FR-CART)
- **FR-CART-1** The cart shall live client-side (localStorage) and be re-validated by the server at checkout.
- **FR-CART-2** At checkout, the server shall recompute prices from the database and ignore client prices.
- **FR-CART-3** The server shall reject checkout if any item is inactive or out of stock, and say which.

### 2.3 Orders (FR-ORD)
- **FR-ORD-1** Checkout shall create an order with a unique human-readable number (`TS-YYYYMMDD-NNNNN`) and status `PENDING_PAYMENT`.
- **FR-ORD-2** Creating an order shall reserve stock. Stock shall be released when the order becomes `PAYMENT_FAILED` (with no retry within the expiry window), `EXPIRED` or `CANCELLED`.
- **FR-ORD-3** Order status transitions shall follow the state machine in [TRD §5](TRD.md#5-state-machines). Illegal transitions shall be rejected and logged.
- **FR-ORD-4** Shoppers shall be able to look up an order by order number and phone.
- **FR-ORD-5** Every state change shall add an `order_events` row (timeline).

### 2.4 Payments: BillPay (FR-PAY)
- **FR-PAY-1** The system shall create a BillPay payment by calling `POST {BILLPAY_BASE_URL}/api/v1/checkout/payments` with headers `x-api-key`, `Content-Type: application/json` and `Idempotency-Key`.
- **FR-PAY-2** The request body shall include `merchantReference`, `amount`, `currency` (`ETB`), `description`, `customer{name, phone, email}`, `returnUrl` and `cancelUrl`.
- **FR-PAY-3** Each payment attempt shall have its own Idempotency-Key (UUID), stored before the call. A network retry of the same attempt shall reuse the same key.
- **FR-PAY-4** The system shall store the BillPay payment ID and checkout URL from the response and return the checkout URL to the frontend.
- **FR-PAY-5** If an order already has an active (non-final) attempt, a repeated "Pay" request shall return the existing checkout URL instead of creating a new payment.
- **FR-PAY-6** A failed or cancelled attempt shall allow a new attempt with a new Idempotency-Key and a new merchantReference suffix (`-A2`, `-A3`, …).
- **FR-PAY-7** The BillPay API key shall be read only from server configuration and shall never appear in logs, responses or the frontend.
- **FR-PAY-8** BillPay errors (non-2xx, or `statusCode` ≠ 2xx in the response envelope) shall be mapped to a clear error for the shopper, with the full detail logged server-side.

### 2.5 Webhooks (FR-WH)
- **FR-WH-1** The system shall expose `POST /api/webhooks/billpay`, which is public and needs no user auth.
- **FR-WH-2** The system shall verify the webhook's authenticity (signature/secret; scheme still to be confirmed with BillPay). Invalid requests shall get HTTP 401, be stored with `signature_valid=false`, and not be processed.
- **FR-WH-3** The system shall store every received webhook raw (headers and body) in `billpay_webhook_events` **before** processing.
- **FR-WH-4** Duplicate webhooks (same BillPay event ID, or same payment ID + status) shall be acknowledged with 2xx and not re-applied.
- **FR-WH-5** The endpoint shall return 2xx quickly (target < 500 ms) once the event is stored. Processing happens asynchronously through Kafka.
- **FR-WH-6** Before marking an order paid, the system shall check that amount and currency match the payment attempt. A mismatch sets the order to `REVIEW_REQUIRED`.
- **FR-WH-7** Out-of-order events (e.g. PENDING after SUCCEEDED) shall not move a payment backwards.

### 2.6 Reconciliation (FR-REC)
- **FR-REC-1** A scheduled job shall query BillPay for the status of attempts that are non-final and older than `RECONCILE_AFTER` (default 3 minutes).
- **FR-REC-2** Attempts that pass `PAYMENT_EXPIRY` (default 30 minutes, to be confirmed with BillPay) with no final status shall become `EXPIRED`.
- **FR-REC-3** Admins shall be able to trigger reconciliation for a single payment manually.
- **FR-REC-4** The return page shall call `GET /api/orders/{number}/status`. If the order is still pending, the backend may run an on-demand status check, rate-limited to one per 10 s per order.

### 2.7 Refunds (FR-REF)
- **FR-REF-1** Admins shall be able to refund a `PAID` order fully or partially.
- **FR-REF-2** The total refunded shall never exceed the amount paid.
- **FR-REF-3** Each refund shall carry its own Idempotency-Key and be recorded with its status (`REQUESTED`, `SUCCEEDED`, `REFUSED`) and reason code.
- **FR-REF-4** A full refund sets the order to `REFUNDED`. A partial refund sets it to `PARTIALLY_REFUNDED`.

### 2.8 Events: Kafka (FR-EVT)
- **FR-EVT-1** Stored webhooks shall be published to topic `billpay.webhook-events` (key = BillPay payment ID).
- **FR-EVT-2** Order state changes shall be published to `orders.events` (`order.created`, `order.paid`, `order.failed`, `order.expired`, `order.refunded`).
- **FR-EVT-3** Consumers shall be idempotent. Failed messages go to a `.DLT` topic after 3 retries.
- **FR-EVT-4** If Kafka is unavailable, stored webhooks shall stay `RECEIVED`, and a sweeper shall republish them once Kafka is back.

### 2.9 Admin (FR-ADM)
- **FR-ADM-1** Admin endpoints (`/api/admin/**`) shall require authentication: JWT issued by `/api/admin/auth/login`, with credentials from configuration.
- **FR-ADM-2** Admins shall see orders, payments, webhooks and refunds with filters (status, date, reference).
- **FR-ADM-3** Order detail shall show the full timeline (order events, payment attempts, webhooks).
- **FR-ADM-4** Dashboard: total paid volume, count by status, success rate, failures by reason code.

---

## 3. External interface requirements

### 3.1 User interface
React SPA, as described in [PRD §4](PRD.md#4-pages-and-screens).

### 3.2 BillPay API
See [BILLPAY_INTEGRATION.md](BILLPAY_INTEGRATION.md). Every BillPay HTTP call goes through one `BillPayClient`.

### 3.3 Internal REST API
See [TRD §6](TRD.md#6-rest-api). JSON, with errors as RFC 7807 Problem Details.

---

## 4. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Security | Secrets come only from env vars. `.env` is git-ignored. |
| NFR-2 | Security | Backend CORS allows only the frontend origin. |
| NFR-3 | Security | Webhook signatures are verified with constant-time comparison. |
| NFR-4 | Security | PII (phone, email) is masked in application logs. |
| NFR-5 | Reliability | No payment state is lost if Kafka or the backend restarts (DB is source of truth; inbox plus sweeper). |
| NFR-6 | Reliability | BillPay calls use a 10 s timeout, retry with the same Idempotency-Key on network errors only (max 2), and a circuit breaker. |
| NFR-7 | Performance | Catalog API p95 < 200 ms locally. Webhook ACK < 500 ms. |
| NFR-8 | Observability | Structured logs with correlation ID (`X-Request-Id`), plus `merchantReference` on every payment log line. |
| NFR-9 | Observability | Actuator health for DB, Kafka and the BillPay reachability check. |
| NFR-10 | Portability | `docker compose up` runs the whole stack. All ports are configurable and non-default. |
| NFR-11 | Maintainability | Backend test coverage ≥ 70% on the payment and webhook packages. BillPay is mocked with WireMock in tests. |
| NFR-12 | Data | Money is `NUMERIC(12,2)` / `BigDecimal`, never floating point. Timestamps are UTC `timestamptz`. |
| NFR-13 | Usability | Responsive from 360 px wide. WCAG AA contrast. |

---

## 5. Traceability (summary)

| Business rule | Requirements |
|---------------|--------------|
| BR-1 Paid only on BillPay confirmation | FR-WH-2, FR-WH-6, FR-REC-1 |
| BR-2 Amount must match | FR-WH-6 |
| BR-3 No double charge | FR-PAY-3, FR-PAY-5, FR-WH-4 |
| BR-4 Expiry | FR-REC-2, FR-ORD-2 |
| BR-5 Refund limits | FR-REF-1, FR-REF-2 |
| BR-7 Key secrecy | FR-PAY-7, NFR-1 |
