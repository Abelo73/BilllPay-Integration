import { adminToken } from '@/lib/admin-api'
import { ApiError, request, type Page } from '@/lib/api'
import type { MyShop } from '@/lib/seller-api'
import { sessionToken } from '@/store/session'

// ---------- verification (seller) ----------

export type IdType = 'FAYDA' | 'KEBELE' | 'PASSPORT' | 'DRIVING_LICENCE'
export type VerificationStatus = 'NONE' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MORE_INFO' | 'REJECTED'
export type VerificationPhoto = 'id-front' | 'id-back' | 'selfie' | 'licence'

export type MyVerification = {
  id: number | null
  status: VerificationStatus
  idType: IdType
  idFront: boolean
  idBack: boolean
  selfie: boolean
  licence: boolean
  details: string | null
  /** What staff asked to fix */
  staffNote: string | null
  submittedAt: string | null
  decidedAt: string | null
  shopVerifiedAt: string | null
}

export const ID_TYPE_LABEL: Record<IdType, string> = {
  FAYDA: 'Fayda national ID',
  KEBELE: 'Kebele ID',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
}

async function uploadWith<T>(url: string, file: File, token: string | null): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

/** Private photos come back as blobs with the token, never as plain links (they're not cached anywhere). */
async function blobUrl(url: string, token: string | null): Promise<string> {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
  if (!res.ok) throw new ApiError(res.status, {})
  return URL.createObjectURL(await res.blob())
}

export const verificationApi = {
  get: () => request<MyVerification>('/seller/verification'),
  details: (idType: IdType, details: string) =>
    request<MyVerification>('/seller/verification', { method: 'PUT', body: JSON.stringify({ idType, details }) }),
  upload: (photo: VerificationPhoto, file: File) =>
    uploadWith<MyVerification>(`/api/seller/verification/photos/${photo}`, file, sessionToken()),
  photo: (photo: VerificationPhoto) => blobUrl(`/api/seller/verification/photos/${photo}`, sessionToken()),
  submit: () => request<MyVerification>('/seller/verification/submit', { method: 'POST' }),
}

// ---------- shoppers ----------

export type ReportReason = 'SCAM' | 'FAKE' | 'PROHIBITED' | 'WRONG_INFO' | 'OFFENSIVE' | 'OTHER'

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SCAM: 'Looks like a scam',
  FAKE: 'Fake or counterfeit',
  PROHIBITED: 'Not allowed to be sold',
  WRONG_INFO: 'Wrong price, photo or details',
  OFFENSIVE: 'Offensive',
  OTHER: 'Something else',
}

export const publicTrustApi = {
  report: (productId: number, reason: ReportReason, details?: string) =>
    request<{ reported: boolean }>(`/products/${productId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) }),
  areas: () => request<string[]>('/areas'),
}

// ---------- staff ----------

async function staff<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminToken.get()
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  })
  if (res.status === 401) {
    adminToken.clear()
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export type VerificationRow = {
  id: number
  status: VerificationStatus
  idType: IdType
  idFront: boolean
  idBack: boolean
  selfie: boolean
  licence: boolean
  details: string | null
  staffNote: string | null
  submittedAt: string | null
  decidedAt: string | null
  decidedBy: string | null
  shop: MyShop
  ownerName: string | null
  ownerPhoneVerified: boolean
  shopVerifiedAt: string | null
}

export type ListingReportRow = {
  productId: number
  productName: string
  slug: string
  imageUrl: string | null
  shopName: string | null
  shopId: number | null
  shopVerified: boolean
  active: boolean
  blockedReason: string | null
  reports: number
  lastReportedAt: string
  reasons: Record<ReportReason, number>
  latest: { reason: ReportReason; details: string | null; createdAt: string }[]
}

export type AreaRow = { id: number; name: string; sortOrder: number; active: boolean }

const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) })

export const trustAdminApi = {
  verifications: (status: string, page = 0) =>
    staff<{ counts: Record<string, number>; page: Page<VerificationRow> }>(`/verifications?status=${status}&page=${page}`),
  verificationPhoto: (id: number, photo: VerificationPhoto) => blobUrl(`/api/admin/verifications/${id}/photos/${photo}`, adminToken.get()),
  decideVerification: (id: number, status: 'APPROVED' | 'MORE_INFO' | 'REJECTED', note?: string) =>
    staff<VerificationRow>(`/verifications/${id}/decision`, body('POST', { status, note })),

  reports: (status: string, page = 0) =>
    staff<{ open: number; page: Page<ListingReportRow> }>(`/listing-reports?status=${status}&page=${page}`),
  hideListing: (productId: number, note: string) => staff(`/listing-reports/${productId}/hide`, body('POST', { note })),
  dismissReports: (productId: number) => staff(`/listing-reports/${productId}/dismiss`, { method: 'POST' }),
  unblockListing: (productId: number) => staff(`/listing-reports/${productId}/unblock`, { method: 'POST' }),

  areas: () => staff<AreaRow[]>('/areas'),
  addArea: (name: string) => staff<AreaRow[]>('/areas', body('POST', { name })),
  updateArea: (id: number, b: { name?: string; active?: boolean }) => staff<AreaRow[]>(`/areas/${id}`, body('PATCH', b)),
  reorderAreas: (ids: number[]) => staff<AreaRow[]>('/areas/order', body('PUT', { ids })),
}
