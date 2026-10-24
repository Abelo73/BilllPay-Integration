import { request, type Page } from '@/lib/api'

export type InboxKind = 'ORDER' | 'PAYMENT' | 'DELIVERY' | 'CHAT' | 'JOB' | 'SHOP' | 'REVIEW' | 'SYSTEM'

export type InboxItem = { id: number; kind: InboxKind; title: string; body: string | null; link: string | null; read: boolean; createdAt: string }

export type NotificationPrefs = { smsOrders: boolean; smsChat: boolean; smsJobs: boolean }

export const inboxApi = {
  list: (page = 0) => request<{ items: Page<InboxItem>; unread: number }>(`/me/inbox?page=${page}`),
  unread: () => request<{ unread: number }>('/me/inbox/unread'),
  read: (id?: number) => request<{ ok: boolean }>('/me/inbox/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) }),
  prefs: () => request<NotificationPrefs>('/me/notification-prefs'),
  savePrefs: (p: NotificationPrefs) => request<NotificationPrefs>('/me/notification-prefs', { method: 'PUT', body: JSON.stringify(p) }),
}
