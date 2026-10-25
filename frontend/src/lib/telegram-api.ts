import { request } from '@/lib/api'
import { staffRequest } from '@/lib/chat-admin-api'

export type TelegramLink = { available: boolean; linked: boolean; username: string | null }

export type TelegramAdmin = {
  configured: boolean
  botUsername: string | null
  channelId: string | null
  webhookSecretSet: boolean
  webhookUrl: string
  linkedUsers: number
  recent: { chatId: string; html: string; at: string }[]
}

export const telegramApi = {
  status: () => request<TelegramLink>('/me/telegram'),
  link: () => request<{ code: string; url: string; expiresAt: string }>('/me/telegram/link', { method: 'POST', body: '{}' }),
  unlink: () => request<{ ok: boolean }>('/me/telegram', { method: 'DELETE' }),
}

export const telegramAdminApi = {
  status: () => staffRequest<TelegramAdmin>('/telegram'),
  connectWebhook: () => staffRequest<{ ok: boolean }>('/telegram/webhook', { method: 'POST' }),
  postNow: () => staffRequest<{ posted: number }>('/telegram/channel/post-now', { method: 'POST' }),
}
