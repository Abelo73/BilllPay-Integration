import { sessionToken, useSession, type Session, type SessionUser } from '@/store/session'
import { useLang } from '@/lib/i18n'
import type { SpecLine } from '@/lib/specs-api'

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
  /** M16: on top of search right now (a paid boost) */
  boosted?: boolean
  /** Filled on the product page only. */
  images?: { url: string; thumbUrl: string }[]
  featured: boolean
  categorySlug: string
  categoryName: string
  /** Who sells it; null = Sodo Gebeya itself */
  seller: Seller | null
  /** null = new goods from a shop */
  condition: ItemCondition | null
  negotiable: boolean
  /** Where the item is (its own area, else the shop's) */
  area: string | null
  /** product page only: the details table (brand, RAM, storage, ...) */
  specs?: SpecLine[]
}

export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'USED'

export const CONDITION_LABEL: Record<ItemCondition, string> = { NEW: 'New', LIKE_NEW: 'Like new', USED: 'Used' }

export type ShopKind = 'SHOP' | 'INDIVIDUAL'

export type Seller = { name: string; slug: string; kind: ShopKind; area: string | null; verified: boolean; pro?: boolean }

/** A seller's public page. */
export type PublicShop = {
  name: string
  slug: string
  kind: ShopKind
  description: string | null
  area: string | null
  logoUrl: string | null
  coverUrl: string | null
  memberSince: string
  productCount: number
  verified: boolean
  /** M17 Pro shop */
  pro?: boolean
}

export type Category = { id: number; name: string; slug: string; parentId?: number | null }

export type Page<T> = {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** {@code area}: an area of Sodo from DeliveryQuote.areas; it can set its own delivery fee. */
export type DeliveryInput = { address: string; city: string; notes?: string; area?: string }

export type CheckoutRequest = {
  items: { productId: number; quantity: number }[]
  customer: { name: string; phone: string; email: string }
  delivery: DeliveryInput
  /** Signed-in customers: also keep this address in the address book. */
  saveAddress?: boolean
  discountCode?: string
  /** BILLPAY (default) or CASH on delivery */
  paymentMethod?: PaymentMethod
}

/** How the buyer pays: online through BillPay before delivery, or in cash to the seller at the door. */
export type PaymentMethod = 'BILLPAY' | 'CASH'

/** areas: where we deliver in Sodo; fee null = the standard flatFee. */
export type DeliveryQuote = { flatFee: number; freeOver: number; currency: string; areas: { name: string; fee: number | null }[] }

export type PriceQuote = {
  subtotal: number
  /** Set when a code was checked (empty in a plain cart quote) */
  discountCode: string
  discountDescription: string | null
  discount: number
  deliveryFee: number
  total: number
  /** One per seller (Sodo Gebeya's own first, seller null), each with its own delivery fee */
  parcels: { seller: string | null; sellerSlug: string | null; itemsTotal: number; deliveryFee: number }[]
}

/** One seller's parcel of an order. */
export type ParcelView = {
  number: string
  parcelNo: number
  /** null = Sodo Gebeya */
  seller: string | null
  sellerSlug: string | null
  itemsTotal: number
  deliveryFee: number
  fulfilmentStatus: FulfilmentStatus | null
  trackingNote: string | null
  shippedAt: string | null
  deliveredAt: string | null
  /** Sent and not confirmed yet: the buyer can tap "I received my items" */
  canConfirmReceipt: boolean
  receivedAt: string | null
  /** Who brings it; set once the parcel is on its way and staff picked a rider */
  rider: { name: string; phone: string } | null
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

/** checkoutUrl is null for cash on delivery: no BillPay page, go to the order page. */
export type CheckoutResponse = { orderNumber: string; checkoutUrl: string | null; paymentMethod?: PaymentMethod }

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVIEW_REQUIRED'
  /** cash on delivery: delivery under way, the buyer pays the seller at the door */
  | 'CASH_ON_DELIVERY'

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
  items: { productId: number; productSlug: string | null; productName: string; unitPrice: number; quantity: number; lineTotal: number; parcelNo: number | null }[]
  payment: {
    attemptNo: number
    status: string
    reasonCode: string | null
    paymentMethod: string | null
    /** Why BillPay never opened this payment; null once it did */
    problem: 'UNREACHABLE' | 'BUSY' | 'KEY_REJECTED' | 'REFUSED' | null
  } | null
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
  /** When an unpaid order's items are released; null once paid or closed */
  payBy: string | null
  /** One per seller */
  parcels: ParcelView[]
  paymentMethod: PaymentMethod
}

/** Reply to "text me a code". devCode is only filled in local test mode (no SMS provider). */
export type PhoneCodeSent = {
  phone: string
  maskedPhone: string
  expiresInSeconds: number
  resendInSeconds: number
  testMode: boolean
  devCode: string | null
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

/** Calls /api with the signed-in customer's token (sellers use it too: lib/seller-api). */
export async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
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
  /** `spec.<key>`: detail filters, e.g. { 'spec.brand': 'Samsung' } */
  products: (params: { category?: string; q?: string; sort?: string; page?: number; size?: number; shop?: string; minPrice?: string; maxPrice?: string; area?: string; near?: string; [spec: `spec.${string}`]: string }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return request<Page<Product>>(`/products?${qs}`)
  },
  featured: () => request<Product[]>('/products/featured'),
  product: (slug: string) => request<Product>(`/products/${encodeURIComponent(slug)}`),
  categories: () => request<Category[]>('/categories'),
  shop: (slug: string) => request<PublicShop>(`/shops/${encodeURIComponent(slug)}`),
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
  confirmReceived: (orderNumber: string, parcelNo: number, phone?: string) =>
    request<OrderStatusView>(`/orders/${encodeURIComponent(orderNumber)}/parcels/${parcelNo}/received`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  cancelOrder: (orderNumber: string, phone: string, reason?: string) =>
    request<OrderStatusView>(`/orders/${encodeURIComponent(orderNumber)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ phone, reason }),
    }),
  delivery: () => request<DeliveryQuote>('/delivery'),
  storeInfo: () => request<{ sandbox: boolean }>('/store-info'),
  cartQuote: (items: { productId: number; quantity: number }[], area?: string) =>
    request<PriceQuote>('/checkout/quote', { method: 'POST', body: JSON.stringify({ items, area }) }),
  checkDiscount: (items: { productId: number; quantity: number }[], code: string, area?: string) =>
    request<PriceQuote>('/discounts/check', { method: 'POST', body: JSON.stringify({ items, code, area }) }),

  addresses: () => request<Address[]>('/me/addresses'),
  addAddress: (body: AddressInput) => request<Address[]>('/me/addresses', { method: 'POST', body: JSON.stringify(body) }),
  updateAddress: (id: number, body: AddressInput) =>
    request<Address[]>(`/me/addresses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAddress: (id: number) => request<Address[]>(`/me/addresses/${id}`, { method: 'DELETE' }),

  register: (body: { fullName: string; email: string; phone: string; password: string }) =>
    request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  phoneStart: (phone: string) =>
    request<PhoneCodeSent>('/auth/phone/start', { method: 'POST', body: JSON.stringify({ phone, language: useLang.getState().lang }) }),
  phoneVerify: (phone: string, code: string, fullName?: string) =>
    request<Session>('/auth/phone/verify', { method: 'POST', body: JSON.stringify({ phone, code, fullName }) }),
  me: () => request<SessionUser>('/me'),
  updateMe: (body: { fullName: string; phone: string }) =>
    request<SessionUser>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<Session>('/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  logoutEverywhere: () => request<{ signedOut: boolean }>('/me/logout-all', { method: 'POST' }),
  myOrders: (page = 0) => request<Page<OrderSummary>>(`/me/orders?page=${page}`),
}
