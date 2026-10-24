import { ApiError, type Page } from '@/lib/api'
import type { Session } from '@/store/session'

const STAFF_KEY = 'tenashop-staff-session'

export type StaffSession = Session

function readStaff(): StaffSession | null {
  try {
    const raw = localStorage.getItem(STAFF_KEY)
    const s = raw ? (JSON.parse(raw) as StaffSession) : null
    return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null
  } catch {
    return null
  }
}

/** The staff member's sign-in, kept apart from any customer session in the same browser. */
export const adminToken = {
  get() {
    return readStaff()?.token ?? null
  },
  session: readStaff,
  set(session: StaffSession) {
    try {
      localStorage.setItem(STAFF_KEY, JSON.stringify(session))
    } catch {
      /* private mode: the session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STAFF_KEY)
    } catch {
      /* ignore */
    }
  },
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminToken.get()
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401 && path !== '/auth/login') {
    adminToken.clear()
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})))
  }
  return res.json() as Promise<T>
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v))
  return s.toString()
}

export type AdminConfig = {
  billpayBaseUrl: string
  sandbox: boolean
  apiKeyConfigured: boolean
  apiKeyHint: string | null
  webhookVerification: 'NONE' | 'HMAC_SHA256'
  webhookSecretConfigured: boolean
  webhookSignatureHeader: string
  webhookPath: string
  publicBaseUrl: string
  reconcileAfter: string
  paymentExpiry: string
}

export type Dashboard = {
  sandbox: boolean
  paidVolume: number
  ordersByStatus: Record<string, number>
  paymentSuccessRate: number | null
  failuresByReason: Record<string, number>
  pendingPayments: number
  webhooksAwaitingProcessing: number
}

export type OrderRow = {
  id: string
  orderNumber: string
  status: string
  fulfilmentStatus: string | null
  total: number
  currency: string
  customerName: string
  customerPhone: string
  deliveryCity: string | null
  createdAt: string
  paidAt: string | null
}

export type DeliveryDetail = {
  address: string | null
  city: string | null
  notes: string | null
  subtotal: number
  discountCode: string | null
  discountAmount: number
  deliveryFee: number
  fulfilmentStatus: string | null
  nextSteps: string[]
  trackingNote: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
}

export type Attempt = {
  id: string
  orderNumber: string | null
  attemptNo: number
  merchantReference: string
  idempotencyKey: string
  billpayPaymentId: string | null
  checkoutUrl: string | null
  status: string
  amount: number
  refundable: number | null
  paymentMethod: string | null
  reasonCode: string | null
  error: string | null
  requestPayload: string | null
  responsePayload: string | null
  expiresAt: string | null
  lastCheckedAt: string | null
  createdAt: string
}

export type Webhook = {
  id: number
  billpayEventId: string | null
  billpayPaymentId: string | null
  merchantReference: string | null
  eventType: string | null
  reportedStatus: string | null
  signatureValid: boolean | null
  signatureScheme: string | null
  status: string
  error: string | null
  headers: string | null
  payload: string
  receivedAt: string
  processedAt: string | null
}

export type Refund = {
  id: string
  orderNumber: string | null
  merchantReference: string
  billpayRefundId: string | null
  amount: number
  currency: string
  reason: string | null
  status: string
  reasonCode: string | null
  external: boolean
  error: string | null
  requestPayload: string | null
  responsePayload: string | null
  createdAt: string
  updatedAt: string
}

export type TimelineEvent = {
  id: number
  type: string
  fromStatus: string | null
  toStatus: string | null
  detail: string | null
  createdAt: string
}

export type NotificationRow = {
  id: number
  kind: string
  orderNumber: string | null
  recipient: string
  subject: string
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'SENDING'
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type OrderDetail = {
  order: OrderRow
  customerEmail: string
  delivery: DeliveryDetail
  emails: NotificationRow[]
  items: { productId: number; productName: string; unitPrice: number; quantity: number; lineTotal: number }[]
  timeline: TimelineEvent[]
  attempts: Attempt[]
  refunds: Refund[]
  webhooks: Webhook[]
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<StaffSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  config: () => request<AdminConfig>('/config'),
  dashboard: () => request<Dashboard>('/dashboard'),
  orders: (p: { status?: string; fulfilment?: string; q?: string; page?: number }) => request<Page<OrderRow>>(`/orders?${qs(p)}`),
  order: (orderNumber: string) => request<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}`),
  fulfil: (orderNumber: string, status: string, note?: string) =>
    request<{ orderNumber: string; fulfilmentStatus: string }>(`/orders/${encodeURIComponent(orderNumber)}/fulfilment`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
  cancelOrder: (orderNumber: string, reason?: string) =>
    request<{ orderNumber: string; status: string }>(`/orders/${encodeURIComponent(orderNumber)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  payments: (p: { status?: string; page?: number }) => request<Page<Attempt>>(`/payments?${qs(p)}`),
  reconcile: (attemptId: string) =>
    request<{ outcome: string; status: string }>(`/payments/${attemptId}/reconcile`, { method: 'POST' }),
  webhooks: (p: { status?: string; page?: number }) => request<Page<Webhook>>(`/webhooks?${qs(p)}`),
  replayWebhook: (id: number) => request<{ replayed: number }>(`/webhooks/${id}/replay`, { method: 'POST' }),
  refunds: (p: { status?: string; page?: number }) => request<Page<Refund>>(`/refunds?${qs(p)}`),
  createRefund: (orderNumber: string, body: { amount: number; reason?: string; paymentAttemptId?: string }) =>
    request<Refund>(`/orders/${encodeURIComponent(orderNumber)}/refunds`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  retryRefund: (id: string) => request<Refund>(`/refunds/${id}/retry`, { method: 'POST' }),
  report: (days: number) => request<Report>(`/reports?days=${days}`),
  discounts: () => request<DiscountRow[]>('/discounts'),
  createDiscount: (body: DiscountInput) => request<DiscountRow[]>('/discounts', { method: 'POST', body: JSON.stringify(body) }),
  updateDiscount: (id: number, body: { active?: boolean; description?: string; expiresAt?: string; clearExpiry?: boolean; usageLimit?: number; clearUsageLimit?: boolean }) =>
    request<DiscountRow[]>(`/discounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** Downloads a CSV export with the staff token (a plain link can't send the Authorization header). */
  downloadCsv: async (kind: 'orders' | 'payments', days: number) => {
    const res = await fetch(`/api/admin/reports/${kind}.csv?days=${days}`, {
      headers: adminToken.get() ? { Authorization: `Bearer ${adminToken.get()}` } : {},
    })
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `tenashop-${kind}.csv`
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
  },
  notifications: (p: { page?: number }) =>
    request<{ page: Page<NotificationRow>; mailboxUrl: string | null }>(`/notifications?${qs(p)}`),

  users: (p: { kind?: string; q?: string; page?: number }) => request<Page<UserRow>>(`/users?${qs(p)}`),
  createStaff: (body: { email: string; fullName: string; role: 'ADMIN' | 'SUPPORT'; password: string }) =>
    request<UserRow>('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: { fullName?: string; role?: string; enabled?: boolean }) =>
    request<UserRow>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetPassword: (id: string, newPassword: string) =>
    request<UserRow>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  unlockUser: (id: string) => request<UserRow>(`/users/${id}/unlock`, { method: 'POST' }),
  revokeSessions: (id: string) => request<UserRow>(`/users/${id}/revoke-sessions`, { method: 'POST' }),
  loginEvents: (p: { userId?: string; page?: number }) => request<Page<LoginEventRow>>(`/login-events?${qs(p)}`),
}

export type UserRow = {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: 'CUSTOMER' | 'SUPPORT' | 'ADMIN'
  enabled: boolean
  locked: boolean
  lockedUntil: string | null
  lastLoginAt: string | null
  createdAt: string
}

export type LoginEventRow = {
  id: number
  userId: string | null
  email: string | null
  portal: 'SHOP' | 'ADMIN'
  success: boolean
  reason: string
  ip: string | null
  userAgent: string | null
  createdAt: string
}

/** Support staff can view everything; only admins see buttons that change things (the API enforces it too). */
export const isAdmin = () => adminToken.session()?.user.role === 'ADMIN'

/** Staff change their own password through /api/me (shared with customers); returns a fresh session. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<StaffSession> {
  const res = await fetch('/api/me/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken.get() ?? ''}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<StaffSession>
}

// ---------- catalog ----------

export type ProductRow = {
  id: number
  name: string
  slug: string
  categoryName: string
  categoryId: number
  price: number
  stock: number
  reserved: number
  available: number
  lowStockThreshold: number
  lowStock: boolean
  featured: boolean
  active: boolean
  imageUrl: string | null
  updatedAt: string | null
}

export type ProductImageView = {
  id: number
  position: number
  url: string
  thumbUrl: string
  width: number | null
  height: number | null
  sizeBytes: number | null
}

export type ProductDetail = { product: ProductRow; description: string | null; images: ProductImageView[]; maxImages: number }

export type CategoryRow = {
  id: number
  name: string
  slug: string
  sortOrder: number
  active: boolean
  productCount: number
  activeProductCount: number
}

export type ChangeRow = { id: number; action: string; detail: string | null; userEmail: string | null; createdAt: string }

export type ProductInput = {
  name: string
  slug?: string
  description?: string
  categoryId: number
  price: number
  stock?: number
  lowStockThreshold: number
  featured: boolean
  active: boolean
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const catalogApi = {
  products: (p: { q?: string; categoryId?: number; status?: string; page?: number }) =>
    request<Page<ProductRow>>(`/products?${qs(p)}`),
  product: (id: number) => request<ProductDetail>(`/products/${id}`),
  create: (body: ProductInput) => request<ProductDetail>('/products', json('POST', body)),
  update: (id: number, body: ProductInput) => request<ProductDetail>(`/products/${id}`, json('PUT', body)),
  setVisible: (id: number, active: boolean) =>
    request<ProductDetail>(`/products/${id}/visibility`, json('PATCH', { active })),
  adjustStock: (id: number, delta: number, reason: string) =>
    request<ProductDetail>(`/products/${id}/stock`, json('POST', { delta, reason })),
  duplicate: (id: number) => request<ProductDetail>(`/products/${id}/duplicate`, { method: 'POST' }),
  changes: (id: number) => request<Page<ChangeRow>>(`/products/${id}/changes`),
  removeImage: (id: number, imageId: number) =>
    request<ProductDetail>(`/products/${id}/images/${imageId}`, { method: 'DELETE' }),
  reorderImages: (id: number, ids: number[]) =>
    request<ProductDetail>(`/products/${id}/images/order`, json('PUT', { ids })),
  /** Multipart upload; lets the browser set the boundary header. */
  async uploadImage(id: number, file: File): Promise<ProductDetail> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/admin/products/${id}/images`, {
      method: 'POST',
      headers: adminToken.get() ? { Authorization: `Bearer ${adminToken.get()}` } : {},
      body: form,
    })
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
    return res.json() as Promise<ProductDetail>
  },
  categories: () => request<CategoryRow[]>('/categories'),
  createCategory: (name: string) => request<CategoryRow[]>('/categories', json('POST', { name })),
  updateCategory: (id: number, body: { name?: string; active?: boolean }) =>
    request<CategoryRow[]>(`/categories/${id}`, json('PATCH', body)),
  reorderCategories: (ids: number[]) => request<CategoryRow[]>('/categories/order', json('PUT', { ids })),
}

/** Labels for customer email kinds (notifications log). */
export const EMAIL_KIND_LABEL: Record<string, string> = {
  ORDER_PLACED: 'Order placed',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  PAYMENT_FAILED: 'Payment failed',
  SHIPPED: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PASSWORD_CHANGED: 'Password changed',
}

export type Report = {
  from: string
  to: string
  totals: { revenue: number; paidOrders: number; orders: number; averageOrder: number; paymentSuccessRate: number; refunded: number }
  salesByDay: { day: string; orders: number; paidOrders: number; revenue: number }[]
  topProducts: { productId: number; name: string; quantity: number; revenue: number }[]
  byMethod: { method: string; finished: number; succeeded: number; successRate: number }[]
  failureReasons: { reason: string; count: number }[]
}

export type DiscountRow = {
  id: number
  code: string
  description: string | null
  kind: 'PERCENT' | 'FIXED'
  value: number
  maxDiscount: number | null
  minSubtotal: number
  startsAt: string | null
  expiresAt: string | null
  usageLimit: number | null
  timesUsed: number
  active: boolean
  /** LIVE, or why it can't be used now: INACTIVE, NOT_STARTED, EXPIRED, USED_UP */
  state: string
  paidOrders: number
  discountGiven: number
  revenue: number
  createdAt: string
}

export type DiscountInput = {
  code: string
  description?: string
  kind: 'PERCENT' | 'FIXED'
  value: number
  maxDiscount?: number
  minSubtotal?: number
  startsAt?: string
  expiresAt?: string
  usageLimit?: number
}
