// Smoke: one shopper, short. Proves the test setup works before a big run.
import http from 'k6/http'
import { check } from 'k6'
import { adminToken, BASE, browse, buy, restock, signUp } from './lib.js'

export const options = {
  scenarios: { smoke: { executor: 'constant-vus', vus: 1, duration: __ENV.DURATION || '30s' } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    checkouts_paid: ['count>0'],
  },
}

export function setup() {
  check(http.get(`${BASE}/actuator/health`), { 'backend healthy': (r) => r.status === 200 })
  return { products: restock(adminToken()) }
}

let customer
export default function (data) {
  customer ??= signUp()
  browse(data.products)
  buy(customer, data.products)
}

export { handleSummary } from './lib.js'
