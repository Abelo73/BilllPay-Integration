// Shared helpers for the TenaShop load tests. They run against the test copy of the shop (perf-backend),
// never your dev data and never the real BillPay: perf-backend talks to the fake BillPay (perf/fakebillpay).
import http from 'k6/http'
import crypto from 'k6/crypto'
import { check, fail, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

export const BASE = __ENV.TARGET || 'http://perf-backend:8282'
export const VUS = Number(__ENV.VUS || 10)
export const DURATION = __ENV.DURATION || '1m'
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'perf-admin@perf.local'
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Perf-admin-2026'
const WEBHOOK_SECRET = __ENV.WEBHOOK_SECRET || 'whsec_perf_secret'

export const checkoutsPaid = new Counter('checkouts_paid')
export const timeToPaid = new Trend('time_to_paid', true)

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function auth(token) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } }
}

export function post(path, body, params = { headers: JSON_HEADERS }) {
  return http.post(`${BASE}${path}`, JSON.stringify(body), params)
}

export function adminToken() {
  const r = post('/api/admin/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (r.status !== 200) fail(`admin sign-in failed: ${r.status} ${r.body}`)
  return r.json('token')
}

/** A new customer account per virtual user (checkout needs a signed-in customer). */
export function signUp() {
  const phone = '09' + String(Math.floor(10000000 + Math.random() * 89999999))
  const r = post('/api/auth/register', {
    fullName: `Perf Shopper ${__VU}`,
    email: `perf-${__VU}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@perf.local`,
    phone,
    password: 'Perf-shopper-2026',
  }, { headers: JSON_HEADERS, tags: { name: 'sign-up' } })
  if (!check(r, { 'sign-up 200': (x) => x.status === 200 })) fail(`sign-up failed: ${r.status} ${r.body}`)
  return { token: r.json('token'), phone }
}

/** Gives every product plenty of stock so checkout tests measure speed, not "sold out". */
export function restock(admin) {
  const list = http.get(`${BASE}/api/admin/products?size=100&status=all`, auth(admin)).json('content') || []
  for (const p of list) {
    const missing = 1000000 - p.stock
    if (missing > 1000) {
      post(`/api/admin/products/${p.id}/stock`, { delta: Math.min(missing, 999000), reason: 'load test' }, auth(admin))
    }
    if (!p.active) http.patch(`${BASE}/api/admin/products/${p.id}/visibility`, JSON.stringify({ active: true }), auth(admin))
  }
  return list.filter((p) => p.price > 0).map((p) => ({ id: p.id, slug: p.slug }))
}

/** What BillPay would send when the shopper pays: a signed PaymentCaptured webhook. */
export function payViaWebhook(orderNumber, amount) {
  const ref = `${orderNumber}-A1`
  const body = JSON.stringify({
    eventId: `perf-${ref}`,
    eventType: 'PaymentCaptured',
    occurredAt: new Date().toISOString(),
    data: { paymentId: `perf-${ref}`, merchantReference: ref, amount, currency: 'ETB', instrument: 'TEST_WALLET' },
  })
  const t = Math.floor(Date.now() / 1000)
  const sig = crypto.hmac('sha256', WEBHOOK_SECRET, `${t}.${body}`, 'hex')
  return http.post(`${BASE}/api/webhooks/billpay`, body, {
    headers: { ...JSON_HEADERS, 'X-Billpay-Signature': `t=${t},v1=${sig}`, 'X-Billpay-Event': 'PaymentCaptured' },
    tags: { name: 'webhook' },
  })
}

/** Full purchase: checkout → (fake) BillPay → webhook → wait until the order shows PAID. */
export function buy(customer, products) {
  const items = [products[Math.floor(Math.random() * products.length)]]
  if (Math.random() < 0.4) items.push(products[Math.floor(Math.random() * products.length)])
  const r = post('/api/checkout', {
    items: [...new Set(items.map((p) => p.id))].map((id) => ({ productId: id, quantity: 1 })),
    customer: { name: `Perf Shopper ${__VU}`, phone: customer.phone, email: `perf-${__VU}@perf.local` },
    delivery: { address: 'Bole, load test lane 1', city: 'Addis Ababa' },
  }, { ...auth(customer.token), tags: { name: 'checkout' } })
  if (!check(r, { 'checkout 200': (x) => x.status === 200 })) return false
  const orderNumber = r.json('orderNumber')
  const started = Date.now()

  const status = http.get(`${BASE}/api/orders/${orderNumber}/status`, { ...auth(customer.token), tags: { name: 'order status' } })
  const total = status.json('total')
  const hook = payViaWebhook(orderNumber, total)
  check(hook, { 'webhook accepted': (x) => x.status === 200 })

  for (let i = 0; i < 40; i++) {
    sleep(0.25)
    const s = http.get(`${BASE}/api/orders/${orderNumber}/status`, { ...auth(customer.token), tags: { name: 'order status' } })
    if (s.status === 200 && s.json('status') === 'PAID') {
      timeToPaid.add(Date.now() - started)
      checkoutsPaid.add(1)
      return true
    }
  }
  check(null, { 'order paid within 10 s': () => false })
  return false
}

/** One shopper looking around: home, categories, a page of products, a product, a search. */
export function browse(products) {
  const get = (path, name) => http.get(`${BASE}${path}`, { tags: { name } })
  check(get('/api/products/featured', 'featured'), { 'featured 200': (r) => r.status === 200 })
  get('/api/categories', 'categories')
  get(`/api/products?page=${Math.floor(Math.random() * 2)}&size=12`, 'product list')
  sleep(Math.random() * 2 + 0.5)
  const p = products[Math.floor(Math.random() * products.length)]
  check(get(`/api/products/${p.slug}`, 'product'), { 'product 200': (r) => r.status === 200 })
  sleep(Math.random() * 2 + 0.5)
  const q = ['coffee', 'basket', 'honey', 'scarf', 'lamp'][Math.floor(Math.random() * 5)]
  get(`/api/products?q=${q}&size=12`, 'search')
  sleep(Math.random() * 2 + 0.5)
}

/** Public product list (no admin needed), for browse-only tests. */
export function publicProducts() {
  const r = http.get(`${BASE}/api/products?size=48`)
  if (r.status !== 200) fail(`product list failed: ${r.status}`)
  return r.json('content').map((p) => ({ id: p.id, slug: p.slug }))
}

/** Saves the end-of-run summary (with each threshold's pass/fail) where the runner reads it. */
export function handleSummary(data) {
  const out = {}
  if (__ENV.SUMMARY_PATH) out[__ENV.SUMMARY_PATH] = JSON.stringify(data)
  return out
}
