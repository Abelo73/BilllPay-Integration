// Webhook storm: BillPay sends many webhooks per second (VUS = webhooks per second). Mix: 60% genuine payments for
// real unpaid orders (some arrive twice, as BillPay retries), 20% exact duplicates, 10% forged (wrong secret),
// 10% for payments the shop doesn't know. Afterwards every order must be PAID exactly once.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'
import { adminToken, auth, BASE, DURATION, placeOrders, restock, signUp, VUS, webhookRequest } from './lib.js'

const ORDERS = 300
const sent = new Counter('webhooks_genuine')
const forged = new Counter('webhooks_forged')
const notPaid = new Counter('orders_not_paid')
const doublePaid = new Counter('orders_paid_twice')

export const options = {
  setupTimeout: '5m',
  teardownTimeout: '3m',
  scenarios: {
    storm: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '15s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '5s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:webhook}': ['p(95)<200'],
    'http_req_failed{name:webhook}': ['rate<0.01'],
    checks: ['rate>0.99'],
    orders_not_paid: ['count==0'],
    orders_paid_twice: ['count==0'],
  },
}

export function setup() {
  const products = restock(adminToken())
  const customer = signUp()
  return { orders: placeOrders(customer, products, ORDERS), token: customer.token }
}

// forged deliveries answer 401 by design; that's not a failure
const accept401 = http.expectedStatuses(200, 401)

export default function (data) {
  const roll = Math.random()
  const o = data.orders[Math.floor(Math.random() * data.orders.length)]
  if (roll < 0.8) {
    // genuine (repeats of the same order are BillPay retries: acknowledged as duplicates)
    const w = webhookRequest(`${o.orderNumber}-A1`, o.total)
    const r = http.post(`${BASE}/api/webhooks/billpay`, w.body, { headers: w.headers, tags: { name: 'webhook' } })
    check(r, { 'genuine webhook 200': (x) => x.status === 200 })
    sent.add(1)
  } else if (roll < 0.9) {
    const w = webhookRequest(`${o.orderNumber}-A1`, o.total, { secret: 'whsec_forged' })
    const r = http.post(`${BASE}/api/webhooks/billpay`, w.body, { headers: w.headers, tags: { name: 'webhook' }, responseCallback: accept401 })
    check(r, { 'forged webhook refused (401)': (x) => x.status === 401 })
    forged.add(1)
  } else {
    const ref = `TS-UNKNOWN-${Math.floor(Math.random() * 1e9)}-A1`
    const w = webhookRequest(ref, 100)
    const r = http.post(`${BASE}/api/webhooks/billpay`, w.body, { headers: w.headers, tags: { name: 'webhook' } })
    check(r, { 'unknown payment webhook 200': (x) => x.status === 200 })
  }
}

/** Every order that got a genuine webhook must end up PAID, and none twice (REVIEW_REQUIRED = paid twice). */
export function teardown(data) {
  // make sure every order got at least one genuine delivery
  for (const o of data.orders) {
    const w = webhookRequest(`${o.orderNumber}-A1`, o.total)
    http.post(`${BASE}/api/webhooks/billpay`, w.body, { headers: w.headers, tags: { name: 'webhook-final' } })
  }
  const pending = new Set(data.orders.map((o) => o.orderNumber))
  for (let i = 0; i < 60 && pending.size > 0; i++) {
    for (const n of [...pending]) {
      const s = http.get(`${BASE}/api/orders/${n}/status`, { ...auth(data.token), tags: { name: 'final check' } })
      const st = s.json('status')
      if (st === 'PAID') pending.delete(n)
      else if (st === 'REVIEW_REQUIRED') {
        doublePaid.add(1)
        pending.delete(n)
      }
    }
    if (pending.size > 0) sleep(1)
  }
  notPaid.add(pending.size)
}

export { handleSummary } from './lib.js'
