// Sample-data stand-in for the Spring Boot backend, for working on the UI without Docker.
// Run: pnpm mock   (listens on BACKEND_PORT, default 8181; stop it before starting the real backend)
import http from 'node:http'

const port = Number(process.env.BACKEND_PORT ?? 8181)
const cats = [
  { id: 1, name: 'Coffee & Tea', slug: 'coffee-tea' },
  { id: 2, name: 'Fashion', slug: 'fashion' },
  { id: 3, name: 'Electronics', slug: 'electronics' },
  { id: 4, name: 'Home & Living', slug: 'home-living' },
  { id: 5, name: 'Pantry', slug: 'pantry' },
]
const raw = [
  ['Yirgacheffe Single Origin Beans', 'yirgacheffe-beans', 650, 120, true, 'coffee-tea'],
  ['Sidamo Natural Roast', 'sidamo-natural', 590, 80, false, 'coffee-tea'],
  ['Handmade Clay Jebena', 'clay-jebena', 1450, 25, true, 'coffee-tea'],
  ['Habesha Netela Scarf', 'habesha-netela', 1200, 40, true, 'fashion'],
  ['Full-Grain Leather Tote', 'leather-tote', 4800, 7, true, 'fashion'],
  ['Everyday Canvas Sneakers', 'canvas-sneakers', 2300, 60, false, 'fashion'],
  ['Wireless Earbuds Pro', 'wireless-earbuds-pro', 5200, 30, true, 'electronics'],
  ['Fitness Smartwatch', 'fitness-smartwatch', 6900, 0, false, 'electronics'],
  ['20,000 mAh Power Bank', 'power-bank-20k', 2100, 50, false, 'electronics'],
  ['Woven Mesob Basket', 'woven-mesob', 3400, 10, true, 'home-living'],
  ['Warm LED Desk Lamp', 'led-desk-lamp', 1750, 35, false, 'home-living'],
  ['Tigray White Honey', 'tigray-white-honey', 1100, 45, false, 'pantry'],
  ['Homemade Berbere Spice', 'berbere-spice', 380, 100, false, 'pantry'],
  ['Sandbox Test Item', 'sandbox-test-item', 10, 1000, false, 'pantry'],
]
const products = raw.map(([name, slug, price, available, featured, cat], i) => ({
  id: i + 1, name, slug, price, available, featured, currency: 'ETB', imageUrl: `/products/${slug}.jpg`,
  description: 'Hand-picked and carefully packed. A sample description long enough to wrap onto a couple of lines.',
  categorySlug: cat, categoryName: cats.find((c) => c.slug === cat).name,
}))
const now = Date.now()
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString()
const orders = [
  ['TS-20261023-00007', 'PAID', 1450, 'Hanna Tesfaye', 2], ['TS-20261023-00006', 'PENDING_PAYMENT', 650, 'Dawit Mekonnen', 4],
  ['TS-20261023-00005', 'PAYMENT_FAILED', 5200, 'Selam Girma', 9], ['TS-20261023-00004', 'REVIEW_REQUIRED', 3400, 'Abebe Kebede', 15],
  ['TS-20261023-00003', 'PARTIALLY_REFUNDED', 4800, 'Meron Alemu', 30], ['TS-20261023-00002', 'EXPIRED', 10, 'Yonas Bekele', 70],
].map(([orderNumber, status, total, customerName, ago], i) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`, orderNumber, status, total, currency: 'ETB', customerName,
  customerPhone: '+25191120447' + i, createdAt: iso(ago), paidAt: status === 'PAID' ? iso(ago - 1) : null,
}))
const page = (content) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 })
const attempt = (n, status, extra = {}) => ({
  id: `a${n}`, orderNumber: 'TS-20261023-00007', attemptNo: n, merchantReference: `TS-20261023-00007-A${n}`,
  idempotencyKey: '6f1c2c1e-3b2a-4b8e-9a51-0c7d2f9e1a0' + n, billpayPaymentId: `pay_8KQ2${n}x`, checkoutUrl: 'https://sandbox.checkout.billpay.et/c/pay_8KQ2',
  status, amount: 1450, refundable: status === 'SUCCEEDED' ? 1450 : null, paymentMethod: status === 'SUCCEEDED' ? 'TEST_WALLET' : null,
  reasonCode: status === 'FAILED' ? 'INSUFFICIENT_FUNDS' : null, error: null,
  requestPayload: JSON.stringify({ merchantReference: `TS-20261023-00007-A${n}`, amount: 1450, currency: 'ETB', description: 'TenaShop order TS-20261023-00007', customer: { name: 'Hanna Tesfaye', phone: '+251911204471', email: 'hanna@example.et' }, returnUrl: 'http://localhost:5280/checkout/return?order=TS-20261023-00007', cancelUrl: 'http://localhost:5280/checkout/cancelled?order=TS-20261023-00007' }),
  responsePayload: JSON.stringify({ statusCode: 200, message: 'Payment created', body: { id: `pay_8KQ2${n}x`, checkoutUrl: 'https://sandbox.checkout.billpay.et/c/pay_8KQ2', status: 'PENDING' } }),
  expiresAt: iso(-25), lastCheckedAt: iso(1), createdAt: iso(n === 1 ? 6 : 3), ...extra,
})
const webhooks = [
  { id: 12, billpayEventId: 'evt_91', billpayPaymentId: 'pay_8KQ22x', merchantReference: 'TS-20261023-00007-A2', eventType: 'payment.captured', reportedStatus: 'CAPTURED', signatureValid: null, signatureScheme: "probe: header 'X-BillPay-Signature' = hmac-sha256 over raw body", status: 'PROCESSED', error: null, headers: JSON.stringify({ 'content-type': 'application/json', 'x-billpay-signature': 'sha256=9f2c…' }), payload: JSON.stringify({ id: 'evt_91', event: 'payment.captured', data: { payment: { id: 'pay_8KQ22x', merchantReference: 'TS-20261023-00007-A2', status: 'CAPTURED', amount: 1450, currency: 'ETB', paymentMethod: 'TEST_WALLET' } } }), receivedAt: iso(2), processedAt: iso(2) },
  { id: 11, billpayEventId: 'evt_90', billpayPaymentId: 'pay_8KQ21x', merchantReference: 'TS-20261023-00007-A1', eventType: 'payment.failed', reportedStatus: 'FAILED', signatureValid: null, signatureScheme: null, status: 'PROCESSED', error: null, headers: '{}', payload: '{"event":"payment.failed"}', receivedAt: iso(5), processedAt: iso(5) },
  { id: 10, billpayEventId: 'evt_test', billpayPaymentId: null, merchantReference: null, eventType: 'webhook.test', reportedStatus: null, signatureValid: null, signatureScheme: 'probe: no match', status: 'IGNORED', error: 'Test delivery from BillPay', headers: '{}', payload: '{"event":"webhook.test"}', receivedAt: iso(40), processedAt: iso(40) },
  { id: 9, billpayEventId: 'evt_89', billpayPaymentId: 'pay_x', merchantReference: null, eventType: 'payment.captured', reportedStatus: 'CAPTURED', signatureValid: false, signatureScheme: 'signature mismatch', status: 'REJECTED', error: null, headers: '{}', payload: '{}', receivedAt: iso(50), processedAt: null },
]
const routes = {
  'GET /api/categories': () => cats,
  'GET /api/products/featured': () => products.filter((p) => p.featured),
  'GET /api/products': (url) => {
    const cat = url.searchParams.get('category'), q = url.searchParams.get('q')?.toLowerCase()
    return page(products.filter((p) => (!cat || p.categorySlug === cat) && (!q || p.name.toLowerCase().includes(q))))
  },
  'POST /api/admin/auth/login': () => ({ token: 'mock', expiresAt: iso(-480), user: { id: 'u-admin', email: 'admin@tenashop.local', fullName: 'TenaShop Admin', phone: null, role: 'ADMIN' } }),
  'GET /api/admin/users': () => page([{ id: 'u-admin', email: 'admin@tenashop.local', fullName: 'TenaShop Admin', phone: null, role: 'ADMIN', enabled: true, locked: false, lockedUntil: null, lastLoginAt: iso(1), createdAt: iso(600) }]),
  'GET /api/admin/login-events': () => page([{ id: 1, userId: 'u-admin', email: 'admin@tenashop.local', portal: 'ADMIN', success: true, reason: 'SUCCESS', ip: '127.0.0.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edg/130', createdAt: iso(1) }]),
  'GET /api/admin/config': () => ({ billpayBaseUrl: 'https://sandbox.api.billpay.et', sandbox: true, apiKeyConfigured: true, apiKeyHint: 'BPG_TEST-…hR18', webhookVerification: 'NONE', webhookSecretConfigured: true, webhookSignatureHeader: 'X-BillPay-Signature', webhookPath: '/api/webhooks/billpay', publicBaseUrl: 'http://localhost:5280', reconcileAfter: 'PT3M', paymentExpiry: 'PT30M' }),
  'GET /api/admin/dashboard': () => ({ sandbox: true, paidVolume: 26450, ordersByStatus: { PENDING_PAYMENT: 3, PAYMENT_FAILED: 2, PAID: 11, PARTIALLY_REFUNDED: 1, REFUNDED: 1, EXPIRED: 2, CANCELLED: 0, REVIEW_REQUIRED: 1 }, paymentSuccessRate: 0.72, failuresByReason: { INSUFFICIENT_FUNDS: 3, CUSTOMER_DECLINED: 2, LIMIT_EXCEEDED: 1, CARD_EXPIRED: 1 }, pendingPayments: 3, webhooksAwaitingProcessing: 0 }),
  'GET /api/admin/orders': () => page(orders),
  'GET /api/admin/payments': () => page([attempt(2, 'SUCCEEDED'), attempt(1, 'FAILED')]),
  'GET /api/admin/webhooks': () => page(webhooks),
  'GET /api/admin/refunds': () => page([{ id: 'r1', orderNumber: 'TS-20261023-00003', merchantReference: 'TS-20261023-00003-R1', billpayRefundId: 'rf_1', amount: 1200, currency: 'ETB', reason: 'Customer returned one item', status: 'SUCCEEDED', reasonCode: null, external: false, error: null, requestPayload: '{}', responsePayload: '{}', createdAt: iso(20), updatedAt: iso(19) }, { id: 'r2', orderNumber: 'TS-20261023-00003', merchantReference: 'TS-20261023-00003-R2', billpayRefundId: null, amount: 50.13, currency: 'ETB', reason: 'Sandbox .13 test', status: 'REFUSED', reasonCode: 'REFUND_REFUSED', external: false, error: null, requestPayload: '{}', responsePayload: '{}', createdAt: iso(10), updatedAt: iso(10) }]),
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const key = `${req.method} ${url.pathname}`
  let body = routes[key]?.(url)
  if (!body && url.pathname.startsWith('/api/products/')) body = products.find((p) => p.slug === url.pathname.split('/').pop())
  if (!body && /\/api\/orders\/.+\/status/.test(url.pathname)) {
    const n = url.pathname.split('/')[3]
    const status = n.endsWith('F') ? 'PAYMENT_FAILED' : n.endsWith('P') ? 'PENDING_PAYMENT' : 'PAID'
    body = { orderNumber: n, status, total: 2100, currency: 'ETB', customerName: 'Hanna Tesfaye', items: [{ productName: 'Yirgacheffe Single Origin Beans', unitPrice: 650, quantity: 2, lineTotal: 1300 }, { productName: 'Tigray White Honey', unitPrice: 800, quantity: 1, lineTotal: 800 }], payment: { attemptNo: 1, status: status === 'PAID' ? 'SUCCEEDED' : status === 'PAYMENT_FAILED' ? 'FAILED' : 'PENDING', reasonCode: status === 'PAYMENT_FAILED' ? 'INSUFFICIENT_FUNDS' : null, paymentMethod: status === 'PAID' ? 'TEST_WALLET' : null }, canRetry: status !== 'PAID', createdAt: iso(5), paidAt: status === 'PAID' ? iso(4) : null }
  }
  if (!body && url.pathname.startsWith('/api/admin/orders/')) {
    const o = orders[0]
    body = { order: o, customerEmail: 'hanna@example.et', items: [{ productId: 3, productName: 'Handmade Clay Jebena', unitPrice: 1450, quantity: 1, lineTotal: 1450 }], attempts: [attempt(1, 'FAILED'), attempt(2, 'SUCCEEDED')], refunds: [], webhooks: webhooks.slice(0, 2).reverse(),
      timeline: [['ORDER_CREATED', null, 'PENDING_PAYMENT', '1 product(s), total 1450.00 ETB', 6], ['PAYMENT_REQUESTED', 'PENDING_PAYMENT', 'PENDING_PAYMENT', 'TS-20261023-00007-A1 billpayId=pay_8KQ21x', 6], ['PAYMENT_FAILED', 'PENDING_PAYMENT', 'PAYMENT_FAILED', 'A1 PENDING->FAILED via webhook#11 reason=INSUFFICIENT_FUNDS', 5], ['PAYMENT_RETRY', 'PAYMENT_FAILED', 'PENDING_PAYMENT', 'attempt 2', 3], ['PAID', 'PENDING_PAYMENT', 'PAID', 'A2 PENDING->SUCCEEDED via webhook#12', 2]].map(([type, fromStatus, toStatus, detail, ago], i) => ({ id: i, orderId: o.id, type, fromStatus, toStatus, detail, createdAt: iso(ago) })) }
  }
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body ?? { detail: 'not found' }))
}).listen(port, () => console.log(`TenaShop mock API (sample data) on http://localhost:${port}`))
