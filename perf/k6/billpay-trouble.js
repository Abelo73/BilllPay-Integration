// BillPay in trouble while people shop. The runner switches the fake BillPay before the test:
//   billpay-slow: every new payment takes 8 s (under the shop's 10 s timeout)
//   billpay-down: every new payment fails with 503
// Shoppers keep browsing (VUS of them) while a quarter as many try to check out. The shop must stay fast for
// browsing, and checkout must answer (slowly, or with a clear "try again"), never hang or take the shop down.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { adminToken, auth, browse, DURATION, post, restock, signUp, VUS } from './lib.js'

const MODE = __ENV.BILLPAY_MODE_UNDER_TEST || 'slow'
const checkoutTime = new Trend('checkout_answer_time', true)

const ramp = (target) => [
  { duration: '15s', target },
  { duration: DURATION, target },
  { duration: '10s', target: 0 },
]

export const options = {
  setupTimeout: '3m',
  scenarios: {
    browsing: { executor: 'ramping-vus', exec: 'browsing', startVUs: 0, stages: ramp(VUS) },
    buying: { executor: 'ramping-vus', exec: 'buying', startVUs: 0, stages: ramp(Math.max(1, Math.round(VUS / 4))) },
  },
  thresholds: {
    // browsing must not suffer from a slow or broken BillPay
    'http_req_duration{scenario:browsing}': ['p(95)<500'],
    'http_req_failed{scenario:browsing}': ['rate<0.01'],
    // checkout answers: within the 10 s BillPay timeout plus a margin when slow, quickly when BillPay is down
    checkout_answer_time: [MODE === 'down' ? 'p(95)<2000' : 'p(95)<11000'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  return { products: restock(adminToken()) }
}

export function browsing(data) {
  browse(data.products)
}

let customer
// while BillPay is down the shop answers 502 PAYMENT_PROVIDER_ERROR (order kept, "try again"): expected
const ok200or502 = http.expectedStatuses(200, 502)

export function buying(data) {
  customer ??= signUp()
  const p = data.products[Math.floor(Math.random() * data.products.length)]
  const r = post('/api/checkout', {
    items: [{ productId: p.id, quantity: 1 }],
    customer: { name: `Perf Shopper ${__VU}`, phone: customer.phone, email: `perf-${__VU}@perf.local` },
    delivery: { address: 'Bole, load test lane 1', city: 'Addis Ababa' },
  }, { ...auth(customer.token), tags: { name: 'checkout' }, responseCallback: ok200or502, timeout: '30s' })
  checkoutTime.add(r.timings.duration)
  if (MODE === 'down') {
    check(r, { 'BillPay down: clear "try again" (502), order kept': (x) => x.status === 502 && x.json('code') === 'PAYMENT_PROVIDER_ERROR' && !!x.json('orderNumber') })
  } else {
    check(r, { 'BillPay slow: checkout still succeeds': (x) => x.status === 200 })
  }
  sleep(1)
}

export { handleSummary } from './lib.js'
