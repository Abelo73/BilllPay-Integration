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

Still slightly over target. **Next (fix 2):** take the product row locks at the very end of the checkout transaction (one conditional `UPDATE … WHERE stock - reserved >= qty` per product) instead of `SELECT … FOR UPDATE` at the start, so shoppers buying the same products wait for each other for milliseconds instead of the whole transaction.

### Admin page check
Browsing, 20 users, 30 s, started from Admin → Load tests in a browser: live numbers updated every 2 s, run passed (95% within 21 ms, 0 errors), result saved in Past runs, k6 report opened.
