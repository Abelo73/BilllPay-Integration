import { request } from '@/lib/api'

/** M9: a saved search; new matching listings arrive in the inbox (and by SMS once a day if chosen). */
export type SavedSearch = {
  id: number
  name: string
  q: string | null
  category: string | null
  specs: Record<string, string | string[] | number | boolean>
  minPrice: number | null
  maxPrice: number | null
  alertInbox: boolean
  alertSms: boolean
  /** listings since it was last opened */
  newCount: number
  /** the shop page that shows it */
  link: string
  lastAlertAt: string | null
  createdAt: string
}

export type SavedSearchInput = {
  name?: string
  q?: string
  category?: string
  specs?: Record<string, string>
  minPrice?: number | null
  maxPrice?: number | null
  alertInbox?: boolean
  alertSms?: boolean
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const searchApi = {
  mine: () => request<SavedSearch[]>('/me/searches'),
  create: (input: SavedSearchInput) => request<SavedSearch>('/me/searches', send('POST', input)),
  update: (id: number, body: { name?: string; alertInbox?: boolean; alertSms?: boolean }) => request<SavedSearch>(`/me/searches/${id}`, send('PATCH', body)),
  seen: (id: number) => request<SavedSearch>(`/me/searches/${id}/seen`, send('POST', {})),
  remove: (id: number) => request<{ deleted: boolean }>(`/me/searches/${id}`, send('DELETE')),
}
