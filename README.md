# TenaShop: BillPay Integration Test Store

A small but realistic e-commerce app for integrating with and testing the **BillPay** payment gateway, sandbox first and then live.

- **Backend:** Spring Boot 4.1 (Java 21), PostgreSQL 16, Flyway, Spring Kafka. Lives in [backend/](backend/).
- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind 4 + shadcn/ui, managed with **pnpm**. Lives in [frontend/](frontend/).
- **Messaging:** Apache Kafka 3.9 (KRaft) + Kafka UI
- **Product photos:** SeaweedFS (S3-compatible), served through the backend at `/api/media/...`
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

Override any port in `.env`.

## Prerequisites

- Java 21, Node.js 20+, pnpm 9 (`corepack enable`)
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- A tunnel so BillPay can reach your webhook: `ngrok` or `cloudflared`

## Setup

1. Copy `.env.example` to `.env` (already done locally, with random secrets).
2. In the BillPay dashboard (Test mode), go to **Developers → API keys → Regenerate**. Paste the key into `BILLPAY_API_KEY`. It is shown only once.

## Run

### Quickest: one script (WSL)
```bash
scripts/dev.sh          # starts whatever is down (Docker, backend, frontend, ngrok), then checks everything
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
2. Copy the signing secret (**shown once**) into `BILLPAY_WEBHOOK_SECRET` and restart the backend.
3. Click **send a test delivery**. In **Admin → Webhooks**, open the event: the *Signature* box shows which header/format matched.
4. Set `BILLPAY_WEBHOOK_SIGNATURE_HEADER` to that header and `BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256`, then restart.

The same steps are in **Admin → BillPay setup**, together with the sandbox test values.
Without a tunnel, payments still settle: a reconciliation job asks BillPay for the status of stale payments (status endpoint still to be confirmed, open question Q5).

## Tests

```bash
cd backend && ./mvnw test   # unit tests; the full-context test runs only when Docker is available
cd frontend && pnpm build   # type-check + production build
```

## Security notes

- The **BillPay API key** (`BPG_TEST-...`) is used only by the backend, in the `x-api-key` header.
- Never use dashboard session tokens (login/hand-off JWTs) in this app, and never commit them.
- `.env` is git-ignored.
- `BILLPAY_WEBHOOK_VERIFICATION=NONE` is allowed **only** against the sandbox URL. The backend refuses to start with unsigned webhooks against a live URL.
