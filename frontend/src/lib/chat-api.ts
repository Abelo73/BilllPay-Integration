import { ApiError, request, type Page } from '@/lib/api'
import { sessionToken } from '@/store/session'

export type ChatSide = 'BUYER' | 'SELLER'

export type ChatProduct = { id: number; name: string; slug: string; price: number; imageUrl: string | null; available: boolean }

export type ChatOffer = {
  id: number
  productId: number
  productName: string
  quantity: number
  unitPrice: number
  total: number
  madeBy: ChatSide
  mine: boolean
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COUNTERED' | 'WITHDRAWN' | 'EXPIRED' | 'USED'
  expiresAt: string
  canAnswer: boolean
  canWithdraw: boolean
  /** accepted, still valid, and you are the buyer */
  canBuy: boolean
}

export type ChatMessage = {
  id: number
  senderRole: ChatSide | 'SYSTEM'
  mine: boolean
  kind: 'TEXT' | 'IMAGE' | 'OFFER' | 'SYSTEM' | 'AUDIO'
  /** the message this one answers (a short quote), or null */
  replyTo: { id: number; mine: boolean; kind: string; text: string | null } | null
  /** voice message: where to play it, and its length in seconds */
  audioUrl: string | null
  audioSeconds: number | null
  body: string | null
  imageUrl: string | null
  offer: ChatOffer | null
  /** looks like an attempt to deal outside the app */
  flagged: boolean
  createdAt: string
}

export type Conversation = {
  id: number
  /** your side in this conversation */
  side: ChatSide
  otherName: string
  shopName: string | null
  shopSlug: string | null
  product: ChatProduct | null
  lastMessagePreview: string | null
  lastMessageAt: string
  unread: boolean
  blockedBy: ChatSide | null
}

/** The other person: online now, last active, typing right now, and when they last read the chat ("Seen"). */
export type ChatOtherStatus = { online: boolean; lastActiveAt: string | null; typing: boolean; readAt: string | null }

export type ChatThread = { conversation: Conversation; messages: ChatMessage[]; canWrite: boolean; other: ChatOtherStatus | null }

export type ReportReason = 'SCAM' | 'OFF_PLATFORM_PAYMENT' | 'ABUSE' | 'SPAM' | 'OTHER'

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const chatApi = {
  list: (filter: 'all' | 'buying' | 'selling', page = 0) => request<Page<Conversation>>(`/chats?filter=${filter}&page=${page}`),
  unread: () => request<{ unread: number }>('/chats/unread'),
  start: (productId: number, text?: string) => request<Conversation>('/chats', json({ productId, text })),
  thread: (id: number, after = 0) => request<ChatThread>(`/chats/${id}?after=${after}`),
  send: (id: number, text: string, replyToId?: number) => request<ChatMessage>(`/chats/${id}/messages`, json({ text, replyToId })),
  /** Tells the other side this person is typing (they see it for a few seconds). */
  typing: (id: number) => request<{ ok: boolean }>(`/chats/${id}/typing`, json({})),
  /** Marks this person as online; sent every 30 s while the app is open. */
  presence: () => request<{ ok: boolean }>('/chats/presence', json({})),
  offer: (id: number, unitPrice: number, quantity = 1, productId?: number) =>
    request<ChatMessage>(`/chats/${id}/offers`, json({ unitPrice, quantity, productId })),
  answer: (offerId: number, action: 'accept' | 'decline' | 'withdraw') =>
    request<ChatOffer>(`/chats/offers/${offerId}/${action}`, json({})),
  block: (id: number, blocked: boolean) => request<{ blocked: boolean }>(`/chats/${id}/block`, json({ blocked })),
  report: (id: number, reason: ReportReason, details?: string) =>
    request<{ reported: boolean }>(`/chats/${id}/report`, json({ reason, details })),
  /** A voice message: the recording as one file (WebM, Ogg or MP4), its length, and an optional reply. */
  async sendVoice(id: number, audio: Blob, seconds: number, replyToId?: number): Promise<ChatMessage> {
    const form = new FormData()
    form.append('file', audio, 'voice')
    const token = sessionToken()
    const q = new URLSearchParams({ seconds: String(seconds) })
    if (replyToId) q.set('replyToId', String(replyToId))
    const res = await fetch(`/api/chats/${id}/voice?${q}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
    return res.json()
  },
  async sendImage(id: number, file: File): Promise<ChatMessage> {
    const form = new FormData()
    form.append('file', file)
    const token = sessionToken()
    const res = await fetch(`/api/chats/${id}/images`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
    return res.json()
  },
}
