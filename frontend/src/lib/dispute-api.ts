import { adminToken } from '@/lib/admin-api'
import { ApiError, request, type Page } from '@/lib/api'
import { sessionToken } from '@/store/session'

export type ProblemReason = 'NOT_RECEIVED' | 'NOT_AS_DESCRIBED' | 'DAMAGED' | 'WRONG_ITEM' | 'MISSING_ITEMS' | 'OTHER'
export type ProblemStatus = 'OPEN' | 'REFUNDED' | 'PART_REFUNDED' | 'SELLER_PAID' | 'WITHDRAWN'

export const REASON_LABEL: Record<ProblemReason, string> = {
  NOT_RECEIVED: "I didn't get it",
  NOT_AS_DESCRIBED: 'Not as described',
  DAMAGED: 'Arrived damaged',
  WRONG_ITEM: 'Wrong item',
  MISSING_ITEMS: 'Items missing',
  OTHER: 'Something else',
}

export const PROBLEM_STATUS_LABEL: Record<ProblemStatus, string> = {
  OPEN: 'Open',
  REFUNDED: 'Refunded',
  PART_REFUNDED: 'Part refunded',
  SELLER_PAID: 'Settled: seller paid',
  WITHDRAWN: 'Closed by buyer',
}

export type ProblemRow = {
  id: number
  orderNumber: string
  parcelNumber: string
  shopName: string
  buyerName: string
  reason: ProblemReason
  status: ProblemStatus
  parcelTotal: number
  refundAmount: number | null
  createdAt: string
  sellerRepliedAt: string | null
  resolvedAt: string | null
}

export type ProblemMessage = { id: number; author: 'BUYER' | 'SELLER' | 'STAFF'; authorName: string | null; body: string; createdAt: string }

export type Problem = ProblemRow & {
  parcelNo: number
  buyerPhone: string | null
  details: string
  decisionNote: string | null
  decidedBy: string | null
  items: { name: string; quantity: number; lineTotal: number }[]
  messages: ProblemMessage[]
  photoIds: number[]
  viewer: 'BUYER' | 'SELLER' | 'STAFF'
  canWrite: boolean
  canWithdraw: boolean
  canAddPhotos: boolean
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

async function upload<T>(path: string, file: File, token: string | null): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json()
}

/** Private photos come back as blobs with the token; never plain links. */
export async function photoUrl(path: string, token: string | null) {
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, {})
  return URL.createObjectURL(await res.blob())
}

export const problemApi = {
  open: (orderNumber: string, parcelNo: number, reason: ProblemReason, details: string) =>
    request<Problem>(`/orders/${encodeURIComponent(orderNumber)}/parcels/${parcelNo}/disputes`, send('POST', { reason, details })),
  forOrder: (orderNumber: string) => request<ProblemRow[]>(`/orders/${encodeURIComponent(orderNumber)}/disputes`),
  mine: () => request<ProblemRow[]>('/me/disputes'),
  get: (id: number) => request<Problem>(`/disputes/${id}`),
  message: (id: number, body: string) => request<Problem>(`/disputes/${id}/messages`, send('POST', { body })),
  withdraw: (id: number) => request<Problem>(`/disputes/${id}/withdraw`, send('POST', {})),
  addPhoto: (id: number, file: File) => upload<Problem>(`/disputes/${id}/photos`, file, sessionToken()),
  photo: (id: number, photoId: number) => photoUrl(`/disputes/${id}/photos/${photoId}`, sessionToken()),
  forMyShop: () => request<ProblemRow[]>('/seller/disputes'),
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminToken.get()
  const res = await fetch(`/api/admin/disputes${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (res.status === 401) {
    adminToken.clear()
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export type Outcome = 'REFUND' | 'PART_REFUND' | 'PAY_SELLER'

export const problemAdminApi = {
  list: (show: 'open' | 'closed', page = 0) => adminRequest<Page<ProblemRow>>(`?show=${show}&page=${page}`),
  count: () => adminRequest<{ open: number }>('/count'),
  get: (id: number) => adminRequest<Problem>(`/${id}`),
  message: (id: number, body: string) => adminRequest<Problem>(`/${id}/messages`, send('POST', { body })),
  decide: (id: number, outcome: Outcome, note: string, amount?: number) =>
    adminRequest<Problem>(`/${id}/decision`, send('POST', { outcome, note, amount })),
  photo: (id: number, photoId: number) => photoUrl(`/admin/disputes/${id}/photos/${photoId}`, adminToken.get()),
}
