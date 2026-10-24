# Performance and load testing

Load tests run from **Admin → Load tests**. They hit a separate copy of the shop (its own database `tenashop_perf`, its own Kafka, emails off) that talks to a **fake BillPay**, so your dev data and the real BillPay sandbox are never touched.

```
Admin → Load tests ─► backend /api/admin/load-tests ─► perf-runner :9930 (k6)
                                                            │ many simulated shoppers
                                                            ▼
                                 perf-backend :8282 ──► perf-billpay :9919 (fake BillPay, 300-800 ms)
                                   │        │
                         Postgres (tenashop_perf)   perf-kafka
k6 numbers ──► Prometheus ──► Grafana
```

## Running

```bash
scripts/dev.sh perf        # start the test environment (first start builds the shop image: a few minutes)
# Admin → Load tests: pick a test, set users and duration, Start; watch live numbers; Stop any time
scripts/dev.sh perf-down   # stop it (it uses ~2 GB of memory while running)
```

- Starting a test is refused while the shop is in **live** BillPay mode.
- One test at a time; limits on users and duration keep the laptop usable.
- Every run keeps its pass/fail per target and k6's HTML report (Admin → Load tests → Past runs → Open).
- The test shop: http://localhost:8282, admin `perf-admin@perf.local` / `Perf-admin-2026` (local only).
- Scripts: [perf/k6](../perf/k6). Fake BillPay answers: [perf/fakebillpay](../perf/fakebillpay). Runner: [perf/runner](../perf/runner).

Numbers from a laptop under WSL are for finding bottlenecks and comparing before/after a change, not capacity promises. The test shop is limited to 2 CPUs and 1 GB so runs are comparable.

## Tests

| Test | What it does | Targets |
|------|--------------|---------|
| Smoke | 1 shopper browses and buys | 0 errors, at least one order paid |
| Browsing | Shoppers load home, categories, product lists, products, search (with think time) | 95% < 300 ms, < 1% errors |
| Checkout | Shoppers sign up, check out (fake BillPay 0.3–0.8 s), get a signed `PaymentCaptured` webhook, wait for PAID | checkout 95% < 1.5 s, webhook 95% < 200 ms, paid within 5 s (95%), < 1% errors |
| Webhook storm | Users = webhooks per second: 60% genuine, 20% repeats, 10% forged, 10% unknown payments | webhook 95% < 200 ms; afterwards every order PAID exactly once |
| Last-item rush | Users = shoppers, each with an account, buying the last 10 units at the same moment | exactly 10 sold, everyone else a clean "sold out", no errors |
| BillPay slow | Fake BillPay takes 8 s per new payment; shoppers browse while a quarter of them check out | browsing 95% < 500 ms; checkout still succeeds within 11 s |
| BillPay down | Fake BillPay answers 503; same mix | browsing 95% < 500 ms; checkout answers "try again" (502, order kept) within 2 s |

## Results

### 2026-10-24: first runs

| Test | Users | Result | Requests/s | 95% within | Errors | Notes |
|------|------:|--------|-----------:|-----------:|-------:|-------|
| Smoke | 1 | passed | 2 | 601 ms | 0 | 6 orders paid, 95% within 0.58 s |
| Browsing | 50 | passed | 45 | 75 ms | 0 | plenty of headroom |
| Checkout | 20 | **missed** | 20 | 1.8 s | 0 | 162 orders, all paid, but paid only after up to **21 s**; checkout up to 11 s |

**Why checkout missed (from the test shop's own metrics):**

1. **Webhooks were applied one at a time.** The webhook endpoint answers fast and hands the work to Kafka, but a single consumer thread read all 3 partitions. Under load a queue formed: webhook → paid took 5.7 s on average, 21.5 s at worst.
2. **Hot product rows.** Every checkout and every payment locks the rows of the products bought, to keep stock exact. With 20 shoppers buying from ~15 products they wait for each other: database connections were held up to 4.4 s.

**Fix 1 (done): one Kafka consumer thread per partition** (`spring.kafka.listener.concurrency: 3`). Events of one payment share a key, so they still arrive in order. Same test, same 20 shoppers:

| Measure | Before | After |
|---|---:|---:|
| Orders paid in 1 minute | 162 | 253 (+56%) |
| Pay → "paid", 95% | 21 s | 5.9 s |
| Webhook → paid, worst | 21.5 s | 5.3 s |
| Checkout, worst | 11 s | 3.7 s |

Still slightly over target after fix 1.

### Admin page check
Browsing, 20 users, 30 s, started from Admin → Load tests in a browser: live numbers updated every 2 s, run passed (95% within 21 ms, 0 errors), result saved in Past runs, k6 report opened.

### 2026-10-24: fix 2, row locks only at the end of checkout

Checkout read the products with `SELECT … FOR UPDATE` at the start and held those row locks for the whole transaction. Now it reads them without locking and reserves stock as the last step, with one conditional statement per product (`UPDATE products SET reserved = reserved + :qty WHERE id = :id AND stock - reserved >= :qty`, in product-id order so two checkouts never wait on each other in a circle). If someone bought the last units in between, nothing is kept and the shopper gets "sold out". Selling and releasing stock use single statements the same way. `StockRushIntegrationTest` proves it: 20 shoppers for 5 units sell exactly 5; orders for the same products in opposite order all go through.

| Checkout, 20 users, 60 s | Start | Fix 1 | Fix 2 |
|---|---:|---:|---:|
| Orders paid | 162 | 253 | 321 |
| Pay → "paid", 95% | 21 s | 5.9 s | 4.1 s (target met) |
| Checkout, worst | 11 s | 3.7 s | 2.9 s |

At that point the test shop used 100% of its 2 CPUs and all 10 database connections. Part of that load was the test itself: it checked the order status every 0.25 s while waiting for "paid", where the real order page checks every 3 s. The test now checks every 1 s (still stricter than real shoppers). With that, **checkout passed every target**: 561 orders paid in the minute, 95% of requests within 0.78 s, paid within 1.2 s (95%), 0 errors. (Not directly comparable to the columns above because the polling changed.)

### Watching a run in Grafana
**TenaShop · Load tests** dashboard (link on the running test): k6's numbers (users, requests/s, 95% response time per request type, errors, orders paid, time to paid) next to the test shop's CPU, heap, database pool, slowest endpoints, webhook delay, Kafka lag and fake-BillPay call times. The test shop is scraped with a `perf_` metric prefix, so load tests (which send forged webhooks and cause errors on purpose) never trigger the real alerts.

### Not run yet
Webhook storm, last-item rush, BillPay slow and BillPay down are built but haven't completed a run: during the webhook storm WSL's disk went read-only (same ext4 error as on 2026-10-23), which stopped Docker. They run as soon as WSL is repaired.
