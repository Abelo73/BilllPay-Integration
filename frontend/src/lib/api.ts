import { sessionToken, useSession, type Session, type SessionUser } from '@/store/session'

export type Product = {
  id: number
  name: string
  slug: string
  description: string
  price: number
  currency: string
  available: number
  lowStock: boolean
  imageUrl: string | null
  /** Filled on the product page only. */
  images?: { url: string; thumbUrl: string }[]
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

export type DeliveryInput = { address: string; city: string; notes?: string }

export type CheckoutRequest = {
  items: { productId: number; quantity: number }[]
  customer: { name: string; phone: string; email: string }
  delivery: DeliveryInput
  /** Signed-in customers: also keep this address in the address book. */
  saveAddress?: boolean
  discountCode?: string
}

export type DeliveryQuote = { flatFee: number; freeOver: number; currency: string }

export type PriceQuote = {
  subtotal: number
  discountCode: string
  discountDescription: string | null
  discount: number
  deliveryFee: number
  total: number
}

export function deliveryFee(quote: DeliveryQuote | undefined, subtotal: number) {
  if (!quote || quote.flatFee <= 0) return 0
  return quote.freeOver > 0 && subtotal >= quote.freeOver ? 0 : quote.flatFee
}

export type FulfilmentStatus = 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

export type Address = {
  id: number
  label: string
  recipientName: string
  phone: string
  addressLine: string
  city: string
  notes: string | null
  isDefault: boolean
}

export type AddressInput = Omit<Address, 'id' | 'isDefault' | 'notes'> & { notes?: string; makeDefault?: boolean }

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
  subtotal: number
  discountCode: string | null
  discountAmount: number
  deliveryFee: number
  total: number
  currency: string
  customerName: string
  items: { productName: string; unitPrice: number; quantity: number; lineTotal: number }[]
  payment: { attemptNo: number; status: string; reasonCode: string | null; paymentMethod: string | null } | null
  canRetry: boolean
  canCancel: boolean
  delivery: {
    address: string | null
    city: string | null
    notes: string | null
    fulfilmentStatus: FulfilmentStatus | null
    trackingNote: string | null
    shippedAt: string | null
    deliveredAt: string | null
  }
  timeline: { type: string; at: string }[]
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
  cancelOrder: (orderNumber: string, phone: string, reason?: string) =>
    request<OrderStatusView>(`/orders/${encodeURIComponent(orderNumber)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ phone, reason }),
    }),
  delivery: () => request<DeliveryQuote>('/delivery'),
  storeInfo: () => request<{ sandbox: boolean }>('/store-info'),
  checkDiscount: (items: { productId: number; quantity: number }[], code: string) =>
    request<PriceQuote>('/discounts/check', { method: 'POST', body: JSON.stringify({ items, code }) }),

  addresses: () => request<Address[]>('/me/addresses'),
  addAddress: (body: AddressInput) => request<Address[]>('/me/addresses', { method: 'POST', body: JSON.stringify(body) }),
  updateAddress: (id: number, body: AddressInput) =>
    request<Address[]>(`/me/addresses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAddress: (id: number) => request<Address[]>(`/me/addresses/${id}`, { method: 'DELETE' }),

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
