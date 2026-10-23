# Technical Requirements / Design Document (TRD)

**System:** TenaShop
**Version:** 0.1 (draft) · **Date:** 2026-10-22
**Related:** [SRS](SRS.md) · [BillPay notes](BILLPAY_INTEGRATION.md)

---

## 1. Tech stack

| Layer | Choice |
|-------|--------|
| Language / runtime | Java 21 |
| Backend framework | Spring Boot 4.1: WebMVC, Data JPA (Hibernate 7), Validation, Security + OAuth2 resource server (admin JWT), Actuator, Spring Kafka. JSON via Jackson 3. |
| HTTP client | Spring `RestClient` (JDK HttpClient), retries network errors only, reusing the same Idempotency-Key |
| DB | PostgreSQL 16 |
| Migrations | Flyway |
| Messaging | Apache Kafka 3.9 (KRaft, single node), Kafka UI (kafbat) |
| API docs | springdoc-openapi (Swagger UI at `/swagger-ui.html`) |
| Build | Maven (wrapper) |
| Tests | JUnit 5, Testcontainers (Postgres, Kafka). WireMock for BillPay is planned (M9). |
| Frontend | React 19, Vite 8, TypeScript 6, Tailwind CSS 4, shadcn/ui (radix-nova), lucide-react, **pnpm** |
| Frontend data | TanStack Query, React Router 8, Zustand (cart), zod |
| Containers | Docker Compose. Frontend served by nginx in the container. |
| Tunnel (dev) | ngrok or cloudflared, for BillPay webhooks |

## 2. Architecture

```
                    ┌──────────────────────────────┐
  Shopper/Admin ───►│ Frontend (React, :5280)      │
                    └──────────────┬───────────────┘
                                   │ /api (REST/JSON)
                    ┌──────────────▼───────────────┐        ┌────────────────────┐
                    │ Backend (Spring Boot, :8181) │──────► │ BillPay API        │
                    │                              │ x-api- │ sandbox.api.       │
                    │  catalog · orders · payments │ key    │ billpay.et         │
                    │  webhooks · reconciliation   │◄───────│ (webhooks via      │
                    │  refunds · admin             │        │  ngrok tunnel)     │
                    └───────┬──────────────┬───────┘        └────────────────────┘
                            │              │
                ┌───────────▼──┐     ┌─────▼───────────────┐
                │ PostgreSQL   │     │ Kafka (:29492 ext)  │◄── Kafka UI (:8191)
                │ (:5544)      │     │ topics: billpay.*,  │
                └──────────────┘     │ orders.events       │
                                     └─────────────────────┘
```

### 2.1 Why Kafka here
Kafka isn't strictly required for a single payment call. It's included because it makes the integration **robust and testable**:
1. **Webhook inbox → Kafka → processor.** The webhook endpoint just stores and acknowledges. Processing is async and retryable, and it's visible in Kafka UI.
2. **Order events** (`order.paid`, …) decouple side effects such as stock, emails and analytics from the payment code.
3. It lets us test **duplicate, out-of-order and delayed delivery** realistically.

The database remains the **source of truth**. Kafka is the transport.

### 2.2 Backend package layout
```
et.tenapay.shop
├── config/           # Security, CORS, Kafka, RestClient, properties
├── common/           # errors (ProblemDetail), money, ids, logging/MDC
├── catalog/          # Product, Category: entity, repo, service, controller
├── order/            # Order, OrderItem, OrderEvent, state machine, controller
├── payment/
│   ├── billpay/      # BillPayClient, DTOs, BillPayProperties, error mapping
│   ├── PaymentAttempt, PaymentService, ReconciliationJob
├── webhook/          # BillPayWebhookController, signature verifier, inbox, processor (Kafka consumer)
├── refund/           # Refund entity/service/controller
├── events/           # Kafka producers/consumers for orders.events
└── admin/            # Admin auth, dashboards, queries
```

## 3. Ports and environment

| Service | Container port | Host port | Env var |
|---------|---------------|-----------|---------|
| postgres | 5432 | **5544** | `POSTGRES_HOST_PORT` |
| backend | 8181 | **8181** | `BACKEND_PORT` |
| kafka (external listener) | 29492 | **29492** | `KAFKA_HOST_PORT` |
| kafka (internal listener) | 9092 | — (docker network only) | — |
| kafka-ui | 8080 | **8191** | `KAFKA_UI_PORT` |
| frontend (nginx) | 80 | **5280** | `FRONTEND_PORT` |

Ports were checked free on the dev machine on 2026-10-22 (8090 was in use and is avoided).

Key environment variables (full list in `.env.example`):
```
BILLPAY_BASE_URL=https://sandbox.api.billpay.et
BILLPAY_API_KEY=BPG_TEST-xxxx            # from dashboard → Developers → API keys
BILLPAY_WEBHOOK_SECRET=                   # from dashboard → Developers → Webhooks (TBC)
APP_PUBLIC_BASE_URL=http://localhost:5280 # used to build returnUrl/cancelUrl
APP_WEBHOOK_PUBLIC_URL=https://<tunnel>/api/webhooks/billpay
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
JWT_SECRET=<random 32+ bytes>
```

## 4. Data model (PostgreSQL)

Payload columns are stored as `TEXT` (raw JSON as received), not `JSONB`, so BillPay payloads are kept byte-for-byte. Source of truth: [V1__init.sql](../backend/src/main/resources/db/migration/V1__init.sql).

```
categories(id PK, name, slug UNIQUE)

products(id PK, category_id FK, name, slug UNIQUE, description, price NUMERIC(12,2),
         currency CHAR(3) DEFAULT 'ETB', stock INT, reserved INT DEFAULT 0,
         image_url, active BOOL, created_at, updated_at, version INT)   -- optimistic lock

orders(id UUID PK, order_number UNIQUE, status, subtotal NUMERIC(12,2), total NUMERIC(12,2),
       currency, customer_name, customer_phone, customer_email,
       paid_at, created_at, updated_at, version INT)

order_items(id PK, order_id FK, product_id FK, product_name, unit_price, quantity, line_total)

order_events(id PK, order_id FK, type, from_status, to_status, detail JSONB, created_at)

payment_attempts(id UUID PK, order_id FK, attempt_no INT,
       merchant_reference UNIQUE,          -- e.g. TS-20261022-00012-A1
       idempotency_key UUID UNIQUE,
       billpay_payment_id UNIQUE NULL,
       checkout_url, status, amount, currency,
       payment_method NULL,                -- TEST_WALLET / TEST_BANK / TEST_CARD / ...
       reason_code NULL,                   -- INSUFFICIENT_FUNDS, CUSTOMER_DECLINED, ...
       request_payload JSONB, response_payload JSONB,
       expires_at, last_checked_at, created_at, updated_at, version INT)

billpay_webhook_events(id PK, billpay_event_id NULL, billpay_payment_id NULL,
       event_type, headers JSONB, payload JSONB, signature_valid BOOL,
       status,                             -- RECEIVED, PUBLISHED, PROCESSED, DUPLICATE, REJECTED, FAILED
       error, received_at, processed_at)
       UNIQUE(billpay_event_id) WHERE billpay_event_id IS NOT NULL

refunds(id UUID PK, order_id FK, payment_attempt_id FK, amount, reason,
        idempotency_key UUID UNIQUE, billpay_refund_id NULL, status, reason_code,
        request_payload JSONB, response_payload JSONB, created_at, updated_at)
```

## 5. State machines

### Order
```
PENDING_PAYMENT ──► PAID ──► PARTIALLY_REFUNDED ──► REFUNDED
      │   │            └───────────────────────────► REFUNDED
      │   ├──► PAYMENT_FAILED ──(retry)──► PENDING_PAYMENT
      │   ├──► EXPIRED
      │   └──► CANCELLED
      └──► REVIEW_REQUIRED   (amount/currency mismatch, manual)
```

### Payment attempt
```
CREATED ──► PENDING ──► SUCCEEDED
   │           ├──────► FAILED     (reason_code set)
   │           ├──────► EXPIRED
   │           └──────► CANCELLED
   └──► ERROR  (create call failed; safe to retry with same key)
```
Final states never move back (FR-WH-7).

## 6. REST API

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products?category=&q=&sort=&page=` | List products |
| GET | `/api/products/{slug}` | Product detail |
| GET | `/api/categories` | Categories |
| POST | `/api/checkout` | Body: items + customer. Creates the order and payment attempt, returns `{orderNumber, checkoutUrl}` |
| POST | `/api/orders/{orderNumber}/pay` | Retry payment, returns `{checkoutUrl}` |
| GET | `/api/orders/{orderNumber}/status?phone=` | Status for the return page and tracking |
| POST | `/api/webhooks/billpay` | BillPay callback |

### Admin (JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Get a JWT |
| GET | `/api/admin/dashboard` | KPIs |
| GET | `/api/admin/orders`, `/api/admin/orders/{id}` | Orders and timeline |
| GET | `/api/admin/payments` | Payment attempts |
| POST | `/api/admin/payments/{id}/reconcile` | Force a status check |
| GET | `/api/admin/webhooks` | Webhook log |
| POST | `/api/admin/webhooks/{id}/replay` | Re-publish a stored webhook |
| POST | `/api/admin/orders/{id}/refunds` | Create a refund |
| CRUD | `/api/admin/products` | Manage products |

## 7. Key sequences

### 7.1 Checkout
```
FE → POST /api/checkout
BE: validate cart, recompute totals, reserve stock (tx)
BE: insert order(PENDING_PAYMENT) + payment_attempt(CREATED, idempotency_key)   [commit]
BE → BillPay POST /api/v1/checkout/payments  (x-api-key, Idempotency-Key)
BE: update attempt → PENDING, store billpay_payment_id + checkout_url
BE → FE {orderNumber, checkoutUrl};  FE: window.location = checkoutUrl
```
The attempt row is committed **before** calling BillPay, so a crash mid-call is recoverable with the same Idempotency-Key.

### 7.2 Webhook
```
BillPay → POST /api/webhooks/billpay
BE: verify signature → insert billpay_webhook_events(RECEIVED) → 200 OK
BE (after commit): publish to billpay.webhook-events → mark PUBLISHED
Consumer: load attempt by billpay_payment_id (lock) → if duplicate/final → DUPLICATE
          else verify amount/currency → transition attempt + order → order_events
          → publish orders.events(order.paid|order.failed) → mark PROCESSED
```

### 7.3 Reconciliation (every 60 s)
```
SELECT attempts WHERE status IN (CREATED, PENDING) AND created_at < now()-RECONCILE_AFTER
→ BillPay GET status (endpoint TBC) → apply same transition logic as webhook processor
→ if past expires_at and still pending → EXPIRED, release stock
```

## 8. Kafka topics

| Topic | Key | Producer | Consumer |
|-------|-----|----------|----------|
| `billpay.webhook-events` | billpay_payment_id | webhook controller / sweeper | WebhookProcessor |
| `billpay.webhook-events.DLT` | — | error handler | (manual inspection) |
| `orders.events` | order_number | Order service | Inventory, Notification (log/email stub) |
| `orders.events.DLT` | — | error handler | — |

Partitions: 3. Replication: 1 (single broker in dev).

## 9. Docker Compose services

```
postgres     postgres:16-alpine           5544:5432   volume pgdata, healthcheck pg_isready
kafka        apache/kafka:3.9.1 (KRaft)   29492:29492 internal listener kafka:9092
kafka-ui     kafbat/kafka-ui:v1.2.0       8191:8080
backend      build ./backend              8181:8181   depends_on postgres, kafka (healthy)
frontend     build ./frontend (nginx)     5280:80     proxies /api → backend:8181
```
Dev mode: run `docker compose up postgres kafka kafka-ui`, then run the backend (`./mvnw spring-boot:run`) and the frontend (`pnpm dev`, port from `.env`) locally.

## 10. Repository layout

```
BillPayIntIntegration/
├── README.md
├── .env.example
├── docker-compose.yml
├── docs/                 # BRD, PRD, SRS, TRD, BILLPAY_INTEGRATION, TEST_PLAN, ROADMAP
├── backend/              # Spring Boot (Maven)
│   └── src/main/resources/db/migration/   # Flyway V1__init.sql, V2__seed.sql
└── frontend/             # React + Vite + shadcn/ui
```

## 11. Testing strategy

| Level | Tooling | Focus |
|-------|---------|-------|
| Unit | JUnit, Mockito | State machines, money math, signature verifier |
| Integration | Testcontainers + WireMock | Checkout → BillPay mock → webhook → order PAID. Duplicates. Mismatch. |
| Contract | WireMock stubs from real sandbox responses | Keep DTOs aligned with BillPay |
| E2E (manual + scripted) | Real BillPay sandbox + tunnel | Every row in [TEST_PLAN.md](TEST_PLAN.md) |
| Frontend | Vitest + Testing Library | Cart, checkout form, return-page polling |
