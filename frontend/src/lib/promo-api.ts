import { adminToken } from '@/lib/admin-api'
import { ApiError, request, type Page, type Product } from '@/lib/api'

/** M16 boosts, M17 the Pro shop plan and home banners. */
export type BoostStatus = 'REQUESTED' | 'ACTIVE' | 'ENDED' | 'REJECTED' | 'CANCELLED'
export type PlanStatus = 'REQUESTED' | 'PAID' | 'REJECTED' | 'CANCELLED'

export type BoostView = {
  id: number
  productId: number
  productName: string
  days: number
  price: number
  status: BoostStatus
  paymentReference: string | null
  startsAt: string | null
  endsAt: string | null
  note: string | null
  createdAt: string
}

export type PlanOrderView = { id: number; months: number; price: number; status: PlanStatus; paymentReference: string | null; note: string | null; createdAt: string }

export type PromoOverview = {
  pro: boolean
  plan: 'FREE' | 'PRO'
  planUntil: string | null
  products: number
  /** null = no limit (Pro, or plans switched off) */
  productLimit: number | null
  planPricePerMonth: number
  commissionOff: number
  boostPrices: Record<string, number>
  payTo: string | null
  boostsOn: boolean
  planOn: boolean
  boosts: BoostView[]
  planOrders: PlanOrderView[]
}

export type ProductStats = { productId: number; name: string; boosted: boolean; phoneReveals: number; chats: number; offers: number }

export type Banner = {
  id: number
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  startsAt: string | null
  endsAt: string | null
  active: boolean
  showing: boolean
  position: number
  clicks: number
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const promoApi = {
  overview: () => request<PromoOverview>('/seller/promo'),
  boost: (productId: number, days: number, reference?: string) => request<PromoOverview>('/seller/promo/boosts', send('POST', { productId, days, reference })),
  boostReference: (id: number, reference: string) => request<PromoOverview>(`/seller/promo/boosts/${id}/reference`, send('POST', { reference })),
  cancelBoost: (id: number) => request<PromoOverview>(`/seller/promo/boosts/${id}/cancel`, send('POST', {})),
  plan: (months: number, reference?: string) => request<PromoOverview>('/seller/promo/plan', send('POST', { months, reference })),
  planReference: (id: number, reference: string) => request<PromoOverview>(`/seller/promo/plan/${id}/reference`, send('POST', { reference })),
  cancelPlan: (id: number) => request<PromoOverview>(`/seller/promo/plan/${id}/cancel`, send('POST', {})),
  stats: () => request<ProductStats[]>('/seller/promo/stats'),
  boosted: () => request<Product[]>('/products/boosted'),
  banners: () => request<Banner[]>('/banners'),
  bannerClick: (id: number) => request<{ linkUrl: string }>(`/banners/${id}/click`, send('POST', {})),
}

async function adminRequest<T>(path: string, init?: RequestInit, json = true): Promise<T> {
  const token = adminToken.get()
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (res.status === 401) {
    adminToken.clear()
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export type AdminBoost = BoostView & { productSlug: string | null; shopId: number | null; shopName: string | null; shopPhone: string | null; decidedBy: string | null }
export type AdminPlan = PlanOrderView & { shopId: number; shopName: string; shopPhone: string | null; pro: boolean; planUntil: string | null; decidedBy: string | null }
export type BannerInput = { title: string; subtitle?: string; linkUrl?: string; startsAt?: string | null; endsAt?: string | null; active?: boolean; position?: number }

export const promoAdminApi = {
  counts: () => adminRequest<{ boosts: number; plans: number }>('/promo/counts'),
  boosts: (show: 'waiting' | 'active' | 'done', page = 0) => adminRequest<Page<AdminBoost>>(`/promo/boosts?show=${show}&page=${page}`),
  confirmBoost: (id: number, reference?: string) => adminRequest<AdminBoost>(`/promo/boosts/${id}/confirm`, send('POST', { reference })),
  rejectBoost: (id: number, note: string) => adminRequest<AdminBoost>(`/promo/boosts/${id}/reject`, send('POST', { note })),
  plans: (show: 'waiting' | 'done', page = 0) => adminRequest<Page<AdminPlan>>(`/promo/plans?show=${show}&page=${page}`),
  confirmPlan: (id: number, reference?: string) => adminRequest<AdminPlan>(`/promo/plans/${id}/confirm`, send('POST', { reference })),
  rejectPlan: (id: number, note: string) => adminRequest<AdminPlan>(`/promo/plans/${id}/reject`, send('POST', { note })),
  banners: () => adminRequest<Banner[]>('/banners'),
  createBanner: (b: BannerInput) => adminRequest<Banner>('/banners', send('POST', b)),
  updateBanner: (id: number, b: BannerInput) => adminRequest<Banner>(`/banners/${id}`, send('PUT', b)),
  deleteBanner: (id: number) => adminRequest<{ deleted: boolean }>(`/banners/${id}`, send('DELETE')),
  bannerImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return adminRequest<Banner>(`/banners/${id}/image`, { method: 'POST', body: form }, false)
  },
}
