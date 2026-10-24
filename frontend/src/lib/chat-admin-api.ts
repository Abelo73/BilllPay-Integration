import { adminToken } from '@/lib/admin-api'
import { ApiError, type Page } from '@/lib/api'
import type { ChatThread } from '@/lib/chat-api'

export type ChatReportRow = {
  id: number
  conversationId: number
  reason: 'SCAM' | 'OFF_PLATFORM_PAYMENT' | 'ABUSE' | 'SPAM' | 'OTHER'
  details: string | null
  status: 'OPEN' | 'RESOLVED'
  resolution: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  buyerName: string
  shopName: string
  reporterSide: 'BUYER' | 'SELLER'
}

export async function staffRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

/** Staff: reported chats. Only reported conversations can be read. */
export const chatAdminApi = {
  reports: (p: { status?: string; page?: number }) =>
    staffRequest<Page<ChatReportRow>>(`/chat-reports?status=${p.status ?? ''}&page=${p.page ?? 0}`),
  report: (id: number) => staffRequest<{ report: ChatReportRow; thread: ChatThread }>(`/chat-reports/${id}`),
  resolve: (id: number, resolution: string, blockConversation: boolean) =>
    staffRequest<ChatReportRow>(`/chat-reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, blockConversation }),
    }),
}

export const REPORT_REASON_LABEL: Record<ChatReportRow['reason'], string> = {
  SCAM: 'Looks like a scam',
  OFF_PLATFORM_PAYMENT: 'Asked to pay outside the app',
  ABUSE: 'Rude or abusive',
  SPAM: 'Spam',
  OTHER: 'Other',
}
