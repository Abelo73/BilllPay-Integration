// Rush on the last items: VUS shoppers (each with their own account) try to buy one of the last 10 units of a
// product at the same moment. Exactly 10 may succeed, everyone else gets a clean "sold out", nothing breaks.
import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter } from 'k6/metrics'
import { adminToken, auth, BASE, post, signUpMany, VUS } from './lib.js'

const STOCK = 10
const won = new Counter('rush_bought')
const soldOut = new Counter('rush_sold_out')
const broken = new Counter('rush_errors')

export const options = {
  setupTimeout: '5m',
  scenarios: {
    rush: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '2m' },
  },
  thresholds: {
    rush_bought: [`count==${STOCK}`],
    rush_sold_out: [`count==${Math.max(0, VUS - STOCK)}`],
    rush_errors: ['count==0'],
    'http_req_duration{name:checkout}': ['p(95)<3000'],
  },
}

export function setup() {
  const admin = adminToken()
  const cats = post('/api/admin/categories', { name: `Rush ${Date.now()}` }, auth(admin)).json()
  const categoryId = cats[cats.length - 1].id
  const p = post('/api/admin/products', {
    name: `Last units ${Date.now()}`, categoryId, price: 999, stock: STOCK, lowStockThreshold: 2, active: true,
  }, auth(admin))
  if (p.status !== 200) fail(`could not create the rush product: ${p.status} ${p.body}`)
  return { productId: p.json('product.id'), customers: signUpMany(VUS), admin }
}

// "sold out" (409) is the expected answer for everyone but 10 shoppers
const ok200or409 = http.expectedStatuses(200, 409)

export default function (data) {
  const c = data.customers[__VU - 1]
  const r = post('/api/checkout', {
    items: [{ productId: data.productId, quantity: 1 }],
    customer: { name: `Rush Shopper ${__VU}`, phone: c.phone, email: `rush-${__VU}@perf.local` },
    delivery: { address: 'Bole, load test lane 1', city: 'Addis Ababa' },
  }, { ...auth(c.token), tags: { name: 'checkout' }, responseCallback: ok200or409 })
  if (r.status === 200) won.add(1)
  else if (r.status === 409 && r.json('code') === 'CART_INVALID') soldOut.add(1)
  else broken.add(1)
  check(r, { 'bought or cleanly sold out': (x) => x.status === 200 || x.status === 409 })
}

export function teardown(data) {
  const p = http.get(`${BASE}/api/admin/products/${data.productId}`, auth(data.admin)).json('product')
  check(p, {
    [`exactly ${STOCK} units reserved`]: (x) => x.reserved === STOCK,
    'nothing left to sell': (x) => x.available === 0,
  })
}

export { handleSummary } from './lib.js'
