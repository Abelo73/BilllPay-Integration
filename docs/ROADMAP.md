# Roadmap and Build Order

## Phase 1: BillPay integration ✅ (2026-10-22 → 23)

| # | Milestone | Status |
|---|-----------|--------|
| M0 | Docs: BRD, PRD, SRS, TRD, BillPay notes, test plan | ✅ Done |
| M1 | Infra: Postgres 5544, Kafka 29492, Kafka UI 8191 (WSL Docker) | ✅ Running |
| M2 | Backend: Spring Boot, Flyway schema, seed products, catalog API, Swagger | ✅ Done |
| M3 | Frontend: landing page, shop, product, cart, checkout, return/cancel/track | ✅ Done |
| M4 | BillPay checkout: client, payment attempts, https redirect | ✅ Real sandbox payments paid |
| M5 | Webhooks + Kafka: inbox, HMAC verification, processor, order events | ✅ Real `PaymentCaptured` verified and processed; forged rejected |
| M6 | Reconciliation: status checks, expiry, return-page polling | ✅ Status endpoint confirmed |
| M7 | Admin: dashboard, orders + timeline, payments, webhooks, BillPay setup | ✅ Done |
| M7b | Accounts: customers, staff roles, lockout, login history, `scripts/dev.sh` | ✅ Done |
| M8 | Refunds | 🟡 Code ready, **blocked by BillPay** ("merchant is at its refund limit") |

Test results: [TEST_PLAN.md](TEST_PLAN.md) → *Results: 2026-10-23*.

---

## Phase 2: grow the store (planned)

Order is the recommended build order. Each milestone ends with tests and a commit.

### P1. Catalog management: products, categories, images ⭐ next
**Goal:** run the store from the admin, with no SQL or file copying.

| Area | Deliverables |
|------|--------------|
| Products | Admin list (photo, name, category, price, stock, status, search/filter); create/edit form (name, slug, description, category, price ETB, stock, featured, active); duplicate; hide/show instead of delete (old orders keep their own copy) |
| Images | Upload JPG/PNG/WebP ≤ 5 MB, content-checked, resized to 1200 px + 400 px thumbnail, stored as WebP; **up to 5 photos per product** with drag-to-reorder and a main photo; served at `/media/...` |
| Storage | `MediaStorage` interface: **local disk** (Docker volume `uploads/`) now, S3-compatible later through one setting |
| Stock | Adjust ±, low-stock threshold and badge, can't go below reserved units; stock history (who, why, when) |
| Categories | Create, rename, reorder, hide; product counts |
| Audit | `catalog_changes` log: "price 650 → 700 by admin@…" |
| Roles | Admin edits; Support views only |
| Storefront | Product page gallery; low-stock and sold-out badges |

### P2. Quality gate: automated tests + CI
- Integration tests with Testcontainers (Postgres, Kafka) and **WireMock as BillPay**, replaying the real sandbox payloads we captured: create payment, `PaymentCaptured`, failed try, duplicate and forged webhooks, accounts and roles, product rules
- GitHub Actions: backend tests and frontend type-check/lint/build on every push
- `docker compose up --build` images verified (backend + nginx frontend)

### P3. Order fulfilment
- Delivery address and phone at checkout (saved address book for customers)
- Fulfilment status separate from payment: `PAID → PROCESSING → SHIPPED → DELIVERED` (plus `CANCELLED`)
- Admin actions: mark processing/shipped (tracking note)/delivered; cancel unpaid orders
- Customer: cancel unpaid orders; order detail page with fulfilment timeline
- Delivery fee rules (flat / free over X ETB)

### P4. Notifications
- Email via SMTP (Mailpit in Docker for dev): order placed, payment confirmed, payment failed, shipped, password changed
- Uses the existing `orders.events` Kafka topic (the notification stub becomes real)
- SMS later (provider to choose)

### P5. Storefront growth
- Better search (name + description), price range filter, sort by popularity
- Product reviews and ratings (verified buyers only)
- Wishlist for signed-in customers
- Discount codes (percentage / fixed, expiry, usage limit) applied before BillPay

### P6. Reports
- Sales by day/week, top products, payment success rate by method, failure reasons
- CSV export of orders and payments (for BillPay settlement reconciliation)

### P7. Go-live
- Refunds finished (when BillPay clears the refund limit) → TC-20…22
- Live config (`BILLPAY_BASE_URL`, live key, live webhook endpoint + secret), webhook timestamp tolerance
- Security: rate limiting on sign-in and checkout, security headers, CORS for the real domain
- Backups (Postgres dump schedule), log retention, health monitoring
- BillPay UAT checklist and sign-off

---

## Decisions for P1 (2026-10-23)
1. **Image storage: MinIO in Docker** (S3-compatible). Code talks plain S3, so AWS S3 / Cloudflare R2 / SeaweedFS later is a config change. MinIO stopped publishing new community images in late 2025, so the image is pinned to a last published release; SeaweedFS (already pulled locally) is the fallback. New ports: S3 API **9910**, console **9911**.
2. **Photos per product: up to 5**, with a main photo and drag-to-reorder; gallery on the product page.
3. **Delete = hide only.** Products stay in the database, so orders and reports stay intact; they can be shown again.
