import type { ChangeRow, ProductDetail, ProductInput, ProductRow } from '@/lib/admin-api'
import { ApiError, request, type FulfilmentStatus, type OrderStatus, type Page, type ShopKind } from '@/lib/api'
import { sessionToken } from '@/store/session'

export type ShopStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

/** The seller's own shop (also what staff see). */
export type MyShop = {
  id: number
  kind: ShopKind
  name: string
  slug: string
  description: string | null
  phone: string | null
  area: string | null
  addressLine: string | null
  logoUrl: string | null
  coverUrl: string | null
  status: ShopStatus
  /** Why it was rejected or paused */
  statusNote: string | null
  decidedAt: string | null
  createdAt: string
  /** Verified badge since; null = not verified */
  verifiedAt: string | null
  /** M17: the Pro plan is paid up, until planUntil */
  pro?: boolean
  planUntil?: string | null
}

export type ShopInput = {
  kind: ShopKind
  name: string
  description?: string
  phone: string
  area?: string
  addressLine?: string
}

/** A paid order as this seller sees it: only their own lines. */
export type SellerOrderRow = {
  orderNumber: string
  status: OrderStatus
  fulfilmentStatus: FulfilmentStatus | null
  /** null for cash orders until the cash is collected */
  paidAt: string | null
  customerName: string
  deliveryCity: string | null
  units: number
  itemsTotal: number
  /** This seller's parcel of the order, e.g. TS-20261025-00012-2 */
  parcelNumber: string
  /** Delivery fee the buyer paid for this parcel */
  deliveryFee: number
  /** The buyer also bought from other sellers in the same checkout; they deliver their own parcels */
  otherSellers: boolean
  nextSteps: FulfilmentStatus[]
  /** cash on delivery: the buyer pays this seller in cash at the door */
  cash: boolean
  /** cash orders: what to collect for this parcel */
  collect: number | null
  /** cash orders: when "cash received" was tapped */
  cashCollectedAt: string | null
}

export type SellerOrderDetail = {
  order: SellerOrderRow
  customerPhone: string | null
  deliveryAddress: string | null
  deliveryNotes: string | null
  trackingNote: string | null
  shippedAt: string | null
  deliveredAt: string | null
  items: { productId: number; productName: string; unitPrice: number; quantity: number; lineTotal: number }[]
}

export type SellerSummary = {
  shop: MyShop
  products: number
  inStore: number
  lowStock: number
  soldOut: number
  toSend: number
  onTheWay: number
  salesToday: number
  ordersToday: number
  salesThisMonth: number
  ordersThisMonth: number
  unitsThisMonth: number
  bestSellers: { productName: string; units: number }[]
  toSendNow: SellerOrderRow[]
  /** Buyers who revealed your phone in the last 30 days */
  contacts30d: number
}

export type SellerOrderTab = 'send' | 'way' | 'done' | 'all'

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v))
  return s.toString()
}

/** Multipart upload with the customer's token; the browser sets the boundary header. */
async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const token = sessionToken()
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export const sellerApi = {
  shop: () => request<MyShop>('/seller/shop'),
  open: (body: ShopInput) => request<MyShop>('/seller/shop', json('POST', body)),
  updateShop: (body: ShopInput) => request<MyShop>('/seller/shop', json('PUT', body)),
  uploadShopImage: (kind: 'logo' | 'cover', file: File) => upload<MyShop>(`/seller/shop/${kind}`, file),
  summary: () => request<SellerSummary>('/seller/summary'),

  orders: (p: { tab: SellerOrderTab; q?: string; page?: number }) =>
    request<Page<SellerOrderRow>>(`/seller/orders?${qs(p)}`),
  order: (orderNumber: string) => request<SellerOrderDetail>(`/seller/orders/${encodeURIComponent(orderNumber)}`),
  advance: (orderNumber: string, status: FulfilmentStatus, note?: string) =>
    request<SellerOrderDetail>(`/seller/orders/${encodeURIComponent(orderNumber)}/fulfilment`, json('POST', { status, note })),
  /** Cash on delivery: the buyer paid me at the door (marks it delivered; our commission goes on my balance). */
  cashReceived: (orderNumber: string) =>
    request<{ orderNumber: string; parcelNo: number; collected: number; commission: number; orderPaid: boolean }>(
      `/seller/orders/${encodeURIComponent(orderNumber)}/cash-received`, json('POST', {})),

  products: (p: { q?: string; status?: string; page?: number }) =>
    request<Page<ProductRow>>(`/seller/products?${qs(p)}`),
}

/** The seller's side of the product editor; same shape as the admin's catalogApi (pages/admin/product-edit). */
export const sellerCatalog = {
  product: (id: number) => request<ProductDetail>(`/seller/products/${id}`),
  create: (body: ProductInput) => request<ProductDetail>('/seller/products', json('POST', body)),
  update: (id: number, body: ProductInput) => request<ProductDetail>(`/seller/products/${id}`, json('PUT', body)),
  setVisible: (id: number, active: boolean) =>
    request<ProductDetail>(`/seller/products/${id}/visibility`, json('PATCH', { active })),
  adjustStock: (id: number, delta: number, reason: string) =>
    request<ProductDetail>(`/seller/products/${id}/stock`, json('POST', { delta, reason })),
  duplicate: (id: number) => request<ProductDetail>(`/seller/products/${id}/duplicate`, { method: 'POST' }),
  changes: (id: number) => request<Page<ChangeRow>>(`/seller/products/${id}/changes`),
  removeImage: (id: number, imageId: number) =>
    request<ProductDetail>(`/seller/products/${id}/images/${imageId}`, { method: 'DELETE' }),
  reorderImages: (id: number, ids: number[]) =>
    request<ProductDetail>(`/seller/products/${id}/images/order`, json('PUT', { ids })),
  uploadImage: (id: number, file: File) => upload<ProductDetail>(`/seller/products/${id}/images`, file),
  categories: () => request<{ id: number; name: string; slug: string; parentId: number | null }[]>('/seller/categories'),
}

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  PENDING: 'Waiting for approval',
  APPROVED: 'Open',
  REJECTED: 'Not approved',
  SUSPENDED: 'Paused',
}

export const KIND_LABEL: Record<ShopKind, string> = { SHOP: 'Shop', INDIVIDUAL: 'Individual seller' }

// ---------- money (M6) ----------

export type PayoutMethod = 'BANK' | 'TELEBIRR' | 'CBE_BIRR' | 'OTHER'

export type Balance = {
  /** Paid by buyers, waiting for delivery to be confirmed */
  held: number
  /** Can be withdrawn now */
  available: number
  /** Asked for, not sent yet */
  requested: number
  paidOut: number
  minimum: number
}

export type PayoutAccount = { method: PayoutMethod; provider: string | null; accountName: string; account: string }

export type PayoutView = {
  id: number
  amount: number
  status: 'REQUESTED' | 'PAID' | 'REJECTED'
  method: PayoutMethod
  provider: string | null
  /** masked, e.g. "•••• 5678" */
  account: string
  reference: string | null
  note: string | null
  requestedAt: string
  decidedAt: string | null
}

export type SellerMoney = { balance: Balance; account: PayoutAccount | null; releaseAfterHours: number; recentPayouts: PayoutView[] }

export type StatementLine = {
  parcelNumber: string
  paidAt: string
  itemsTotal: number
  deliveryFee: number
  commissionPercent: number
  commission: number
  sellerAmount: number
  fulfilmentStatus: string | null
  payoutStatus: 'HELD' | 'RELEASED' | 'CANCELLED'
  releasedAt: string | null
}

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  BANK: 'Bank account',
  TELEBIRR: 'telebirr',
  CBE_BIRR: 'CBE Birr',
  OTHER: 'Other',
}

export const moneyApi = {
  get: () => request<SellerMoney>('/seller/money'),
  saveAccount: (body: { method: PayoutMethod; provider?: string; accountName: string; account: string }) =>
    request<PayoutAccount>('/seller/money/account', json('PUT', body)),
  requestPayout: (amount: number) => request<PayoutView>('/seller/money/payouts', json('POST', { amount })),
  statement: (page = 0) => request<Page<StatementLine>>(`/seller/money/statement?page=${page}`),
}
