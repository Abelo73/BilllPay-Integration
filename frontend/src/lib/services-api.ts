import { ApiError, request, type Page } from '@/lib/api'
import { sessionToken } from '@/store/session'

export const TRADES = [
  'ELECTRICIAN', 'PLUMBER', 'CARPENTER', 'TAILOR', 'PAINTER', 'PHONE_REPAIR', 'TUTOR', 'MECHANIC', 'CLEANING', 'OTHER',
] as const
export type Trade = (typeof TRADES)[number]

export const TRADE_LABEL: Record<Trade, string> = {
  ELECTRICIAN: 'Electrician',
  PLUMBER: 'Plumber',
  CARPENTER: 'Carpenter',
  TAILOR: 'Tailor',
  PAINTER: 'Painter',
  PHONE_REPAIR: 'Phone repair',
  TUTOR: 'Tutor',
  MECHANIC: 'Mechanic',
  CLEANING: 'Cleaning',
  OTHER: 'Other',
}

export type ProCard = {
  id: number
  displayName: string
  trade: Trade
  headline: string | null
  areas: string | null
  yearsExperience: number | null
  rating: number | null
  ratingCount: number
  jobsDone: number
  /** lowest "from" price in the price list */
  priceFrom: number | null
}

export type PriceLine = { label: string; priceFrom: number | null }

export type ProDetail = {
  card: ProCard
  bio: string | null
  prices: PriceLine[]
  photos: { id: number; url: string }[]
  /** owner and staff only */
  phone: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null
  statusNote: string | null
  createdAt: string
}

export type ProInput = {
  displayName: string
  trade: Trade
  headline?: string
  bio?: string
  yearsExperience?: number | null
  areas?: string
  phone: string
  prices: PriceLine[]
}

export type Quote = {
  id: number
  pro: ProCard
  price: number
  message: string | null
  available: string | null
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
  createdAt: string
  /** only after you accepted this quote */
  proPhone: string | null
}

export type Timing = 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'DATE'

export type Job = {
  id: number
  trade: Trade
  description: string
  area: string
  timing: Timing
  preferredDate: string | null
  budget: number | null
  status: 'OPEN' | 'ASSIGNED' | 'DONE' | 'CANCELLED' | 'EXPIRED'
  createdAt: string
  expiresAt: string
  photoUrls: string[]
  quoteCount: number
  /** all quotes, for the customer */
  quotes: Quote[]
  /** the viewing pro's own quote */
  myQuote: Quote | null
  customerName: string
  /** for the pro whose quote was accepted */
  customerPhone: string | null
  rating: number | null
  review: string | null
  direct: boolean
  /** you posted this job */
  mine: boolean
}

export type JobInput = {
  trade: Trade
  description: string
  area: string
  timing: Timing
  preferredDate?: string | null
  budget?: number | null
  proId?: number | null
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const token = sessionToken()
  const res = await fetch(`/api${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json()
}

export const servicesApi = {
  pros: (p: { trade?: Trade; q?: string; page?: number }) =>
    request<Page<ProCard>>(`/pros?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  pro: (id: number) => request<ProDetail>(`/pros/${id}`),
  myPro: () => request<{ exists: boolean; profile?: ProDetail }>('/me/pro'),
  saveMyPro: (input: ProInput) => request<ProDetail>('/me/pro', send('PUT', input)),
  addProPhoto: (file: File) => upload<{ id: number; url: string }>('/me/pro/photos', file),
  deleteProPhoto: (id: number) => request<{ deleted: boolean }>(`/me/pro/photos/${id}`, send('DELETE')),

  postJob: (input: JobInput) => request<Job>('/jobs', send('POST', input)),
  addJobPhoto: (id: number, file: File) => upload<{ url: string }>(`/jobs/${id}/photos`, file),
  myJobs: (page = 0) => request<Page<Job>>(`/jobs/mine?page=${page}`),
  job: (id: number) => request<Job>(`/jobs/${id}`),
  accept: (id: number, quoteId: number) => request<Job>(`/jobs/${id}/accept/${quoteId}`, send('POST', {})),
  cancel: (id: number) => request<Job>(`/jobs/${id}/cancel`, send('POST', {})),
  done: (id: number, rating: number, review?: string) => request<Job>(`/jobs/${id}/done`, send('POST', { rating, review })),

  proInbox: (page = 0) => request<{ open: Job[]; quoted: Page<Job> }>(`/pro/jobs?page=${page}`),
  quote: (id: number, price: number, message?: string, available?: string) =>
    request<Job>(`/jobs/${id}/quotes`, send('POST', { price, message, available })),
  withdraw: (id: number) => request<Job>(`/jobs/${id}/quotes/withdraw`, send('POST', {})),
}
