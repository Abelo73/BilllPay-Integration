# Roadmap and Build Order

| # | Milestone | Deliverables | Status |
|---|-----------|--------------|-----------|
| M0 | Docs | BRD, PRD, SRS, TRD, BillPay notes, test plan | ✅ Done |
| M1 | Infra | `docker-compose.yml` (Postgres 5544, Kafka 29492, Kafka UI 8191), `.env.example` | ✅ Running in WSL Docker (Postgres, Kafka, Kafka UI); backend runs in WSL with Java 21 | ✅ Running in WSL Docker (Postgres, Kafka, Kafka UI) |
| M2 | Backend skeleton | Spring Boot project, Flyway schema, seed products, catalog API, Swagger | ✅ Compiles, unit tests pass |
| M3 | Frontend skeleton | Vite + Tailwind + shadcn, layout, **landing page**, shop, product, cart | ✅ Builds; landing, shop, product, cart, checkout, return/cancel/track pages |
| M4 | BillPay checkout | `BillPayClient`, checkout endpoint, payment attempts, redirect | ✅ Real sandbox payment created and paid (2026-10-23) |
| M5 | Webhooks + Kafka | Webhook endpoint, inbox, Kafka processor, `orders.events` | ✅ Real PaymentCaptured webhook verified (HMAC) and processed via Kafka → order PAID; forged webhook rejected (TC-32) |
| M6 | Reconciliation | Scheduled status check, expiry, return-page polling | ✅ Status endpoint confirmed (GET /api/v1/checkout/payments/{id}); job polls it |
| M7 | Admin | Login, orders and timeline, payments, webhook log, replay | ✅ Admin UI at /admin: dashboard, orders + timeline, payments (re-check), webhooks (payload, headers, signature, replay), refunds, BillPay setup guide |
| M8 | Refunds | Refund API and UI | 🟡 Code done (create/retry, over-refund guard, refund webhooks, external refunds); refund endpoint unconfirmed (Q6) |
| M9 | Hardening | Robustness tests, Testcontainers + WireMock suite, docs update | All of TEST_PLAN A–C pass |
| M10 | Go-live prep | Live config, BillPay UAT checklist | BillPay sign-off |

## Before M4: get from BillPay / dashboard
1. Regenerate the test API key and copy it into `.env` (it is shown only once).
2. Make one sandbox create-payment call and record the response shape (Q1).
3. Configure the webhook URL in Dashboard → Developers → Webhooks, copy the secret (shown once) and send a test delivery; the admin Webhooks page shows the detected signature scheme (Q2, Q3).
4. Check the IP whitelist (Q10).
