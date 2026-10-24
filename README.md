# TenaShop: BillPay Integration Test Store

A small but realistic e-commerce app for integrating with and testing the **BillPay** payment gateway, sandbox first and then live.

- **Backend:** Spring Boot 4.1 (Java 21), PostgreSQL 16, Flyway, Spring Kafka. Lives in [backend/](backend/).
- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind 4 + shadcn/ui, managed with **pnpm**. Lives in [frontend/](frontend/).
- **Messaging:** Apache Kafka 3.9 (KRaft) + Kafka UI
- **Product photos:** SeaweedFS (S3-compatible), served through the backend at `/api/media/...`
- **Monitoring:** Prometheus + Grafana with provisioned dashboards and alerts ([docs/MONITORING.md](docs/MONITORING.md))
- **Runtime:** Docker Compose, using **non-default ports** throughout

## Documents

| Doc | Purpose |
|-----|---------|
| [docs/BRD.md](docs/BRD.md) | Business requirements |
| [docs/PRD.md](docs/PRD.md) | Product requirements: features, user stories, pages |
| [docs/SRS.md](docs/SRS.md) | Software requirements (numbered FR/NFR) |
| [docs/TRD.md](docs/TRD.md) | Technical design: architecture, data model, APIs, Kafka, Docker |
| [docs/BILLPAY_INTEGRATION.md](docs/BILLPAY_INTEGRATION.md) | What we know about the BillPay API, plus open questions |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Sandbox integration test matrix |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | **Step-by-step: setup → first payment → every test case** |
| [docs/screenshots/](docs/screenshots/) | What each screen looks like |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and progress |

## Ports (all non-default)

| Service | URL |
|---------|-----|
| Frontend (shop) | http://localhost:5280 |
| Admin | http://localhost:5280/admin (`ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`) |
| Backend API | http://localhost:8181 (Swagger: `/swagger-ui.html`) |
| Kafka UI | http://localhost:8191 |
| PostgreSQL | `localhost:5544` |
| Kafka (from host) | `localhost:29492` |
| Photo storage (SeaweedFS S3 API) | `localhost:9910` (bucket `tenashop-media`) |
| Photo storage file browser | http://localhost:9911 |
| Grafana (dashboards) | http://localhost:8484 (view without signing in; `admin` / `GRAFANA_ADMIN_PASSWORD` to edit) |
| Prometheus (metrics, alerts) | http://localhost:9390/alerts |
| Alertmanager (alert emails, silences) | http://localhost:9393 (emails land in Mailpit) |
| Emails (Mailpit test inbox) | http://localhost:8626 (SMTP on `localhost:2626`) |

Override any port in `.env`.

## Prerequisites

- Java 21, Node.js 20+, pnpm 9 (`corepack enable`)
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- A tunnel so BillPay can reach your webhook: `ngrok` or `cloudflared`

## Setup

1. Copy `.env.example` to `.env` (already done locally, with random secrets).
2. In the BillPay dashboard, go to **Developers → API keys → Regenerate**, once with the **Test** toggle and once with **Live**. Paste the keys into `BILLPAY_SANDBOX_API_KEY` and `BILLPAY_LIVE_API_KEY` (each is shown only once).
3. **Sandbox or live** is switched in **Admin → BillPay setup → Payment mode**: no restart, and orders keep the mode they were placed in. Live stays locked until its key and webhook secret are set, signatures are enforced, and no admin uses a well-known password.

## Run

### Quickest: one script (WSL)
```bash
scripts/dev.sh          # restarts the backend (loads new code), starts whatever else is down, then checks everything
scripts/dev.sh up       # same, but leaves a running backend alone (faster when the Java code hasn't changed)
scripts/dev.sh check    # checks only
scripts/dev.sh test     # checks + smoke test (sign-up, sign-in, roles, forged webhook)
scripts/dev.sh logs backend    # or frontend / ngrok
scripts/dev.sh stop     # stop what the script started (stop-all also stops Docker)
```
From PowerShell: `.\scripts\dev.ps1` (same commands). Anything already running, such as a backend in your own terminal, is detected and left alone. Logs go to `.run/`.

The frontend uses a flat `node_modules` (`frontend/.npmrc`) with both Windows and Linux build tools, so it runs from either side. Install with `pnpm install` from Windows.

### Option A: everything in Docker
```bash
docker compose up -d --build
```

### Option B: infra in Docker, apps locally (best for development)
```bash
docker compose up -d postgres kafka kafka-ui

# backend (reads ../.env automatically)
cd backend && ./mvnw spring-boot:run

# frontend (proxies /api to the backend)
cd frontend && pnpm install && pnpm dev
```

### Option C: UI only, with sample data (no Docker needed)
```bash
cd frontend
pnpm mock   # sample-data API on :8181. Stop it before starting the real backend.
pnpm dev    # http://localhost:5280 (admin: any password)
```

### Receive BillPay webhooks locally
```bash
ngrok http --url=<your-static-domain>.ngrok-free.dev 8181
```
1. BillPay dashboard → **Developers → Webhooks → Add endpoint**: `https://<your-domain>/api/webhooks/billpay`
2. Copy the signing secret (**shown once**) into `BILLPAY_SANDBOX_WEBHOOK_SECRET` (Test) or `BILLPAY_LIVE_WEBHOOK_SECRET` (Live) and restart the backend. Add the same URL in both modes.
3. Click **send a test delivery**. In **Admin → Webhooks**, open the event: the *Signature* box shows which header/format matched.
4. Set `BILLPAY_WEBHOOK_SIGNATURE_HEADER` to that header and `BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256`, then restart.

The same steps are in **Admin → BillPay setup**, together with the sandbox test values.
Without a tunnel, payments still settle: a reconciliation job asks BillPay for the status of stale payments (status endpoint still to be confirmed, open question Q5).

## Tests

```bash
cd backend && ./mvnw verify   # unit + end-to-end tests (needs Docker: Postgres and Kafka run in Testcontainers)
cd frontend && pnpm lint && pnpm build   # lint, type-check, production build
```

The end-to-end tests (`backend/src/test/java/et/tenapay/shop/it/`) start the whole app with real Postgres and Kafka and a fake BillPay (WireMock) that replays the payloads captured from the sandbox: checkout, `PaymentCaptured` webhooks (genuine, duplicate, forged, tampered), failed tries, missed webhooks, amount mismatch, BillPay outages, expiry, the refund limit, accounts and roles, and catalog rules. They never call the real BillPay.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the backend tests, frontend lint and build, and both Docker image builds on every push.

## Security notes

- The **BillPay API key** (`BPG_TEST-...`) is used only by the backend, in the `x-api-key` header.
- Never use dashboard session tokens (login/hand-off JWTs) in this app, and never commit them.
- `.env` is git-ignored.
- `BILLPAY_WEBHOOK_VERIFICATION=NONE` is for sandbox experiments only: live mode refuses to switch on without signatures, and a live payment only accepts webhooks signed with the live secret.
