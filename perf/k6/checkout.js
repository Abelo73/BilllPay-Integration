// Checkout load: shoppers buying. Each one signs up once, then repeatedly checks out, gets "paid" by a signed
// BillPay webhook, and waits until the order shows PAID. The fake BillPay answers in 300-800 ms like the sandbox.
import { sleep } from 'k6'
import { adminToken, buy, DURATION, restock, signUp, VUS } from './lib.js'

export const options = {
  scenarios: {
    checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration{name:checkout}': ['p(95)<1500'], // includes the 300-800 ms BillPay call
    'http_req_duration{name:webhook}': ['p(95)<200'],
    time_to_paid: ['p(95)<5000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  return { products: restock(adminToken()) }
}

let customer
export default function (data) {
  customer ??= signUp()
  buy(customer, data.products)
  sleep(Math.random() + 0.5)
}

export { handleSummary } from './lib.js'
