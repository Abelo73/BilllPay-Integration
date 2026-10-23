import { sessionToken, useSession, type Session, type SessionUser } from '@/store/session'

export type Product = {
  id: number
  name: string
  slug: string
  description: string
  price: number
  currency: string
  available: number
  imageUrl: string | null
  featured: boolean
  categorySlug: string
  categoryName: string
}

export type Category = { id: number; name: string; slug: string }

export type Page<T> = {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type CheckoutRequest = {
  items: { productId: number; quantity: number }[]
  customer: { name: string; phone: string; email: string }
}

export type CheckoutResponse = { orderNumber: string; checkoutUrl: string }

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVIEW_REQUIRED'

export type OrderStatusView = {
  orderNumber: string
  status: OrderStatus
  total: number
  currency: string
  customerName: string
  items: { productName: string; unitPrice: number; quantity: number; lineTotal: number }[]
  payment: { attemptNo: number; status: string; reasonCode: string | null; paymentMethod: string | null } | null
  canRetry: boolean
  createdAt: string
  paidAt: string | null
}

/** RFC 7807 problem returned by the backend. */
export type OrderSummary = {
  orderNumber: string
  status: OrderStatus
  total: number
  currency: string
  itemCount: number
  createdAt: string
  paidAt: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.detail === 'string' ? body.detail : `Request failed (${status})`)
    this.status = status
    this.code = typeof body.code === 'string' ? body.code : undefined
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = sessionToken()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401 && token) {
    // The session ended (expired, password changed, signed out elsewhere): forget it.
    useSession.getState().clear()
    // Public endpoints still work as a guest, so try once more without the token.
    if (!retried && !path.startsWith('/me')) return request<T>(path, init, true)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<T>
}

export const api = {
  products: (params: { category?: string; q?: string; sort?: string; page?: number; size?: number }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return request<Page<Product>>(`/products?${qs}`)
  },
  featured: () => request<Product[]>('/products/featured'),
  product: (slug: string) => request<Product>(`/products/${encodeURIComponent(slug)}`),
  categories: () => request<Category[]>('/categories'),
  checkout: (body: CheckoutRequest) =>
    request<CheckoutResponse>('/checkout', { method: 'POST', body: JSON.stringify(body) }),
  pay: (orderNumber: string, phone: string) =>
    request<CheckoutResponse>(`/orders/${encodeURIComponent(orderNumber)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  orderStatus: (orderNumber: string, phone: string) =>
    request<OrderStatusView>(
      `/orders/${encodeURIComponent(orderNumber)}/status?phone=${encodeURIComponent(phone)}`,
    ),

  register: (body: { fullName: string; email: string; phone: string; password: string }) =>
    request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<SessionUser>('/me'),
  updateMe: (body: { fullName: string; phone: string }) =>
    request<SessionUser>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<Session>('/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  logoutEverywhere: () => request<{ signedOut: boolean }>('/me/logout-all', { method: 'POST' }),
  myOrders: (page = 0) => request<Page<OrderSummary>>(`/me/orders?page=${page}`),
}
