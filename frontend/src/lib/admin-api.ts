import { ApiError, type Page } from '@/lib/api'

const TOKEN_KEY = 'tenashop-admin-token'

export const adminToken = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* private mode: the session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
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
  total: number
  currency: string
  customerName: string
  customerPhone: string
  createdAt: string
  paidAt: string | null
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

export type OrderDetail = {
  order: OrderRow
  customerEmail: string
  items: { productId: number; productName: string; unitPrice: number; quantity: number; lineTotal: number }[]
  timeline: TimelineEvent[]
  attempts: Attempt[]
  refunds: Refund[]
  webhooks: Webhook[]
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string; expiresAt: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  config: () => request<AdminConfig>('/config'),
  dashboard: () => request<Dashboard>('/dashboard'),
  orders: (p: { status?: string; q?: string; page?: number }) => request<Page<OrderRow>>(`/orders?${qs(p)}`),
  order: (orderNumber: string) => request<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}`),
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
}
