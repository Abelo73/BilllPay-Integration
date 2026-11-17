import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, BadgeCheck, Camera, Check, CheckCheck, Flag, HandCoins, Loader2, MapPin, Mic, MoreVertical, Reply, Send, ShieldAlert, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useReducer, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/person-avatar'
import { ApiError } from '@/lib/api'
import { ChatAlertSettings } from '@/components/message-alerts'
import { clock, useVoiceRecorder, VoicePlayer } from '@/components/voice-note'
import { subscribeLive, useLiveConnected } from '@/lib/live'
import { chatApi, type ChatMessage, type ChatOffer, type ReportReason } from '@/lib/chat-api'
import { playChime } from '@/lib/chat-sound'
import { formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'
import { chatTime } from './chats'

const STATUS_LABEL: Record<ChatOffer['status'], string> = {
  PENDING: 'Waiting for an answer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  COUNTERED: 'Countered',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
  USED: 'Bought',
}

function OfferCard({ offer, onAnswer, busy }: { offer: ChatOffer; onAnswer: (a: 'accept' | 'decline' | 'withdraw') => void; busy: boolean }) {
  const t = useT()
  const live = offer.status === 'PENDING' || offer.status === 'ACCEPTED'
  return (
    <div className={cn('w-64 space-y-2 rounded-2xl border-2 bg-card p-3', live ? 'border-warning' : 'border-border opacity-80')}>
      <p className="text-xs font-bold text-amber-ink">{offer.mine ? t('Your offer') : t('Offer for you')}</p>
      <p className="text-xl font-extrabold tabular-nums">
        {formatETB(offer.unitPrice)}
        {offer.quantity > 1 && <span className="text-sm font-semibold text-muted-foreground"> × {offer.quantity}</span>}
      </p>
      <p className="truncate text-xs text-muted-foreground">{offer.productName}</p>
      <p className="text-xs font-semibold">{t(STATUS_LABEL[offer.status])}</p>
      {offer.canAnswer && (
        <div className="flex gap-2">
          <Button size="sm" className="h-9 flex-1" disabled={busy} onClick={() => onAnswer('accept')}>{t('Accept')}</Button>
          <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => onAnswer('decline')}>{t('Decline')}</Button>
        </div>
      )}
      {offer.canWithdraw && (
        <Button size="sm" variant="ghost" className="h-9 w-full" disabled={busy} onClick={() => onAnswer('withdraw')}>{t('Withdraw')}</Button>
      )}
      {offer.canBuy && (
        <p className="rounded-lg bg-accent p-2 text-xs text-accent-foreground">
          {t('Agreed for 48 hours. Buying at this price from the chat is coming soon; until then, ask the seller to set the price.')}
        </p>
      )}
    </div>
  )
}

/** Who the other person is: a shop's public details, or a buyer's picture and bio only if they chose to share them. */
function ContactDialog({ id, open, onOpenChange, name }: { id: number; open: boolean; onOpenChange: (open: boolean) => void; name: string }) {
  const t = useT()
  const contact = useQuery({ queryKey: ['chat-contact', id], queryFn: () => chatApi.contact(id), enabled: open })
  const c = contact.data
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <PersonAvatar name={c?.name ?? name} url={c?.avatarUrl ?? null} className="size-24 text-2xl" />
          <DialogTitle className="pt-2 text-xl">{c?.name ?? name}</DialogTitle>
          <DialogDescription>{c?.kind === 'SHOP' ? t('Shop') : t('Buyer')}</DialogDescription>
        </DialogHeader>
        {contact.isLoading && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
        {c?.kind === 'SHOP' && (
          <div className="space-y-3 text-sm">
            {(c.verified || c.pro) && (
              <div className="flex flex-wrap justify-center gap-2">
                {c.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                    <BadgeCheck className="size-3.5" /> {t('Verified')}
                  </span>
                )}
                {c.pro && <span className="rounded-full bg-amber-soft px-2.5 py-1 text-xs font-bold text-amber-ink">{t('Pro shop')}</span>}
              </div>
            )}
            {c.area && (
              <p className="flex items-center justify-center gap-1.5 text-muted-foreground">
                <MapPin className="size-4" /> {c.area}
              </p>
            )}
            {c.since && (
              <p className="text-center text-xs text-muted-foreground">
                {t('On Sodo Gebeya since {date}', { date: new Date(c.since).toLocaleDateString([], { month: 'long', year: 'numeric' }) })}
              </p>
            )}
          </div>
        )}
        {c?.kind === 'PERSON' &&
          (c.personId ? (
            <div className="space-y-3 text-sm">
              {c.area && (
                <p className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4" /> {c.area}
                </p>
              )}
              {c.bio && <p className="rounded-xl bg-muted p-3 text-center leading-relaxed">{c.bio}</p>}
            </div>
          ) : (
            <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
              {t('This person keeps their profile private, so only their name is shown here.')}
            </p>
          ))}
        <DialogFooter className="sm:justify-center">
          {c?.kind === 'SHOP' && c.shopSlug && (
            <Button asChild className="h-11 w-full">
              <Link to={`/shops/${c.shopSlug}`}>{t('View shop')}</Link>
            </Button>
          )}
          {c?.kind === 'PERSON' && c.personId && (
            <Button asChild className="h-11 w-full">
              <Link to={`/people/${c.personId}`}>{t('View profile')}</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The short text for a message in a quote, the reply bar, or the list of chats. */
function previewText(kind: string, text: string | null, t: (s: string) => string) {
  if (kind === 'TEXT') return text ?? ''
  if (kind === 'AUDIO') return t('Voice message')
  if (kind === 'IMAGE') return t('Photo')
  if (kind === 'OFFER') return t('Offer')
  return ''
}

/**
 * One message. Messages from the same person in a row are grouped: they sit close together, and only the last of the
 * group shows its time and the speech-bubble tail. A reply button sits beside each message; a reply shows the message
 * it answers above its text, and tapping that quote scrolls to the original.
 */
function Bubble({ m, grouped, last, onReply, onQuote, onAnswer, busy }: {
  m: ChatMessage
  grouped: boolean
  last: boolean
  onReply: () => void
  onQuote: (id: number) => void
  onAnswer: (offerId: number, a: 'accept' | 'decline' | 'withdraw') => void
  busy: boolean
}) {
  const t = useT()
  if (m.kind === 'SYSTEM') {
    return <p className="mx-auto my-2 max-w-xs rounded-full bg-background px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">{m.body}</p>
  }
  const tail = last ? (m.mine ? 'rounded-br-md' : 'rounded-bl-md') : ''
  const quote = m.replyTo && (
    <button
      type="button"
      onClick={() => onQuote(m.replyTo!.id)}
      className={cn(
        'mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs',
        m.mine ? 'border-primary-foreground/70 bg-primary-foreground/15' : 'border-primary bg-muted',
      )}
    >
      <span className="block font-bold">{m.replyTo.mine ? t('You') : t('Other person')}</span>
      <span className="line-clamp-2 opacity-90">{previewText(m.replyTo.kind, m.replyTo.text, t)}</span>
    </button>
  )

  let content
  if (m.kind === 'OFFER' && m.offer) {
    content = (
      <>
        {quote}
        <OfferCard offer={m.offer} busy={busy} onAnswer={(a) => onAnswer(m.offer!.id, a)} />
      </>
    )
  } else if (m.kind === 'IMAGE' && m.imageUrl) {
    content = (
      <div className={cn('max-w-[80%] overflow-hidden rounded-2xl p-1 shadow-sm', m.mine ? 'bg-primary' : 'border bg-card', tail)}>
        {quote && <div className="px-1 pt-1">{quote}</div>}
        <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
          <img src={m.imageUrl} alt={t('Photo in chat')} className="max-h-72 max-w-[18rem] object-cover" />
        </a>
      </div>
    )
  } else if (m.kind === 'AUDIO' && m.audioUrl) {
    content = (
      <>
        {quote}
        <div className={cn('max-w-[85%]', tail)}>
          <VoicePlayer src={m.audioUrl} seconds={m.audioSeconds} mine={m.mine} />
        </div>
      </>
    )
  } else {
    content = (
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm',
          m.mine ? 'bg-primary text-primary-foreground' : 'border bg-card',
          tail,
        )}
      >
        {quote}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
      </div>
    )
  }

  return (
    <div id={`msg-${m.id}`} className={cn('group flex items-end gap-1', m.mine ? 'flex-row-reverse' : 'flex-row', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className={cn('flex min-w-0 flex-col', m.mine ? 'items-end' : 'items-start')}>
        {content}
        {m.flagged && !m.mine && (
          <p className="mt-1 flex max-w-[80%] items-start gap-1.5 text-xs font-medium text-destructive">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {t('Careful: never pay outside Sodo Gebeya or before you get the item.')}
          </p>
        )}
        {last && <span className="mt-1 px-1 text-[11px] text-muted-foreground">{chatTime(m.createdAt)}</span>}
      </div>
      <button
        type="button"
        onClick={onReply}
        aria-label={t('Reply')}
        title={t('Reply')}
        className="mb-6 grid size-8 shrink-0 place-items-center rounded-full bg-background text-muted-foreground opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Reply className="size-4" />
      </button>
    </div>
  )
}

/** One conversation (design S12): messages, photos, offers, block and report. */
export function ChatPage() {
  const t = useT()
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const session = useSession((s) => s.session)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerPrice, setOfferPrice] = useState('')
  const [offerQty, setOfferQty] = useState('1')
  const [reportOpen, setReportOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('OFF_PLATFORM_PAYMENT')
  const [details, setDetails] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const live = useLiveConnected()
  // when the other side is typing: the server says so on each poll, and a live "typing" event shows it at once
  const [typingUntil, setTypingUntil] = useState(0)
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    return subscribeLive(({ type, data }) => {
      if (type === 'typing' && data.conversationId === id) {
        setTypingUntil(Date.now() + 4000)
        qc.invalidateQueries({ queryKey: ['chat', id] })
      }
      if (type === 'chat' && data.conversationId === id) qc.invalidateQueries({ queryKey: ['chat', id] })
    })
  }, [id, qc])
  useEffect(() => {
    const ms = typingUntil - Date.now()
    if (ms <= 0) return
    const timer = window.setTimeout(repaint, ms + 50)
    return () => window.clearTimeout(timer)
  }, [typingUntil])

  const thread = useQuery({
    queryKey: ['chat', id],
    queryFn: () => chatApi.thread(id),
    enabled: !!session && Number.isFinite(id),
    // new messages, typing and read receipts arrive live; the timer is only a safety net while the stream is up
    refetchInterval: live ? 15_000 : 2500,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  })
  const count = thread.data?.messages.length ?? 0
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  // a chime when a new message from the other side arrives while this chat is open
  const lastIncoming = useRef<number | null>(null)
  const newestIncoming = [...(thread.data?.messages ?? [])].reverse().find((m) => !m.mine && m.kind !== 'SYSTEM')?.id ?? null
  useEffect(() => {
    lastIncoming.current = null
  }, [id])
  useEffect(() => {
    if (newestIncoming === null) return
    if (lastIncoming.current !== null && newestIncoming > lastIncoming.current) playChime()
    lastIncoming.current = newestIncoming
  }, [newestIncoming])

  // tell the other side we are typing, at most every 2.5 s
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [text])

  const lastTyping = useRef(0)
  const typingPing = () => {
    const now = Date.now()
    if (now - lastTyping.current < 2500) return
    lastTyping.current = now
    chatApi.typing(id).catch(() => {})
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chat', id] })
    qc.invalidateQueries({ queryKey: ['chats'] })
  }
  const send = useMutation({
    mutationFn: () => chatApi.send(id, text, replyTo?.id),
    onSuccess: () => {
      setText('')
      setReplyTo(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const voice = useMutation({
    mutationFn: ({ audio, seconds }: { audio: Blob; seconds: number }) => chatApi.sendVoice(id, audio, seconds, replyTo?.id),
    onSuccess: () => {
      setReplyTo(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const recorder = useVoiceRecorder((audio, seconds) => voice.mutate({ audio, seconds }))
  const startRecording = () => {
    recorder.start().catch(() => toast.error(t('Allow the microphone to send voice messages.')))
  }
  const photo = useMutation({ mutationFn: (f: File) => chatApi.sendImage(id, f), onSuccess: refresh, onError: (e) => toast.error(e.message) })
  const offer = useMutation({
    mutationFn: () => chatApi.offer(id, Number(offerPrice), Number(offerQty) || 1),
    onSuccess: () => {
      setOfferOpen(false)
      setOfferPrice('')
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const answer = useMutation({
    mutationFn: ({ offerId, a }: { offerId: number; a: 'accept' | 'decline' | 'withdraw' }) => chatApi.answer(offerId, a),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  })
  const block = useMutation({
    mutationFn: (blocked: boolean) => chatApi.block(id, blocked),
    onSuccess: (r) => {
      toast.success(r.blocked ? t('Blocked. They can no longer message you here.') : t('Unblocked'))
      refresh()
    },
  })
  const report = useMutation({
    mutationFn: () => chatApi.report(id, reason, details),
    onSuccess: () => {
      setReportOpen(false)
      toast.success(t('Thanks. Our team will look at this conversation.'))
    },
    onError: (e) => toast.error(e.message),
  })

  if (!session) return <Navigate to={`/login?next=/chats/${idParam}`} replace />
  if (thread.error instanceof ApiError && thread.error.status === 404) {
    return <p className="py-20 text-center text-muted-foreground">{t('This conversation doesn’t exist.')} <Link to="/chats" className="text-brand underline">{t('Back to chats')}</Link></p>
  }
  const th = thread.data
  const c = th?.conversation
  const iBlocked = c?.blockedBy === c?.side
  // "Seen" under my latest message once the other side has opened the chat after it was sent
  const lastMineId = [...(th?.messages ?? [])].reverse().find((m) => m.mine && m.kind !== 'SYSTEM')?.id
  const lastMine = th?.messages.find((m) => m.id === lastMineId)
  const seen = !!lastMine && !!th?.other?.readAt && new Date(th.other.readAt).getTime() >= new Date(lastMine.createdAt).getTime()
  const typingNow = !!th?.other?.typing || typingUntil > Date.now()
  const dayLabel = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today.getTime() - 86_400_000)
    if (d.toDateString() === today.toDateString()) return t('Today')
    if (d.toDateString() === yesterday.toDateString()) return t('Yesterday')
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-8rem)] max-w-2xl flex-col md:h-[calc(100svh-5rem)] md:py-4">
      <div className="flex flex-col border-b bg-card md:rounded-t-2xl md:border">
        <div className="flex items-center gap-2 px-2 py-2">
          <Button asChild variant="ghost" size="icon" className="size-11" aria-label={t('Back to chats')}>
            <Link to="/chats"><ArrowLeft /></Link>
          </Button>
          <button type="button" onClick={() => setContactOpen(true)} aria-label={t('About this person')} className="shrink-0 rounded-full ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
            <PersonAvatar name={c?.otherName ?? '?'} url={c?.otherAvatarUrl ?? null} className="size-10 text-sm" />
          </button>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setContactOpen(true)}>
            <p className="truncate font-bold">{c?.otherName ?? '…'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {c?.side === 'BUYER' ? t('Seller') : t('Buyer')}
              {c?.shopSlug && c.side === 'BUYER' && <> · <Link to={`/shops/${c.shopSlug}`} className="text-brand hover:underline">{t('view shop')}</Link></>}
            </p>
            {th?.other && !iBlocked && (
              <p className="truncate text-xs font-semibold">
                {typingNow ? (
                  <span className="text-primary">{t('typing…')}</span>
                ) : th.other.online ? (
                  <span className="text-primary">● {t('Online')}</span>
                ) : th.other.lastActiveAt ? (
                  <span className="text-muted-foreground">{t('Last seen {time}', { time: chatTime(th.other.lastActiveAt) })}</span>
                ) : null}
              </p>
            )}
          </div>
          <ChatAlertSettings />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label={t('More options')}><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => block.mutate(!iBlocked)}>
                <Ban /> {iBlocked ? t('Unblock') : t('Block')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                <Flag /> {t('Report')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {c?.product && (
          <Link to={`/product/${c.product.slug}`} className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-muted/60 p-2 hover:bg-muted">
            {c.product.imageUrl ? (
              <img src={c.product.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <span className="size-10 rounded-lg bg-accent" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.product.name}</span>
              <span className="text-sm font-extrabold tabular-nums">{formatETB(c.product.price)}</span>
            </span>
            <span className="text-xs font-bold text-brand">{t('View')}</span>
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30 px-3 py-3 md:border-x">
        <div role="note" className="flex gap-2 rounded-xl bg-amber-soft p-3 text-xs leading-relaxed text-amber-ink">
          <ShieldAlert className="size-4 shrink-0" />
          {t("Keep payments on Sodo Gebeya so you're protected. Never send money by phone transfer before you receive the item.")}
        </div>
        {thread.isLoading && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
        {th?.messages.map((m, i, all) => {
          const prev = all[i - 1]
          const next = all[i + 1]
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
          const grouped = !newDay && !!prev && prev.kind !== 'SYSTEM' && m.kind !== 'SYSTEM' && prev.mine === m.mine
          const last = !next || next.kind === 'SYSTEM' || m.kind === 'SYSTEM' || next.mine !== m.mine || new Date(next.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
          return (
            <Fragment key={m.id}>
              {newDay && <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{dayLabel(m.createdAt)}</p>}
              <Bubble
                m={m}
                grouped={grouped}
                last={last}
                busy={answer.isPending}
                onReply={() => setReplyTo(m)}
                onQuote={(quoted) => document.getElementById(`msg-${quoted}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                onAnswer={(offerId, a) => answer.mutate({ offerId, a })}
              />
              {m.id === lastMineId && (
                <p className={cn('mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold', seen ? 'text-primary' : 'text-muted-foreground')}>
                  {seen ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />}
                  {seen ? t('Seen') : t('Sent')}
                </p>
              )}
            </Fragment>
          )
        })}
        {typingNow && (
          <div className="mt-3 flex items-start">
            <span aria-label={t('typing…')} className="flex items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-3.5 py-3 shadow-sm">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${dot * 150}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {th && !th.canWrite ? (
        <p className="border-t bg-card p-4 text-center text-sm text-muted-foreground md:rounded-b-2xl md:border">
          {iBlocked ? t('You blocked this conversation. Unblock it from the menu to write again.') : t('This conversation is blocked.')}
        </p>
      ) : (
        <div className="space-y-2 border-t bg-card p-2.5 md:rounded-b-2xl md:border">
          {replyTo && (
            <div className="flex items-center gap-2 rounded-xl border-l-4 border-primary bg-muted/60 py-1.5 pl-3 pr-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-primary">
                  {t('Replying to')} {replyTo.mine ? t('your message') : (c?.otherName ?? t('them'))}
                </p>
                <p className="truncate text-xs text-muted-foreground">{previewText(replyTo.kind, replyTo.body, t)}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={t('Cancel reply')} onClick={() => setReplyTo(null)}>
                <X className="size-4" />
              </Button>
            </div>
          )}
          {recorder.recording && (
            <div className="flex items-center gap-2 rounded-3xl border border-destructive/40 bg-background px-2 py-1.5">
              <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full text-destructive" aria-label={t('Delete recording')} onClick={recorder.cancel}>
                <Trash2 className="size-5" />
              </Button>
              <p className="flex flex-1 items-center gap-2 text-sm font-semibold tabular-nums">
                <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                {clock(recorder.seconds)}
                <span className="text-xs font-normal text-muted-foreground">{t('Recording… tap send when you are done')}</span>
              </p>
              <Button type="button" size="icon" className="size-10 shrink-0 rounded-full" aria-label={t('Send voice message')} onClick={recorder.stop}>
                <Send className="size-[18px]" />
              </Button>
            </div>
          )}
          {offerOpen && (
            <form
              className="flex flex-wrap items-end gap-2 rounded-xl border border-warning bg-amber-soft/50 p-2"
              onSubmit={(e) => {
                e.preventDefault()
                offer.mutate()
              }}
            >
              <div className="min-w-32 flex-1 space-y-1">
                <Label htmlFor="offer-price" className="text-xs">{t('Price per item (ETB)')}</Label>
                <Input id="offer-price" inputMode="decimal" required value={offerPrice} onChange={(e) => setOfferPrice(e.target.value.replace(/[^\d.]/g, ''))} className="h-10 bg-card" />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor="offer-qty" className="text-xs">{t('Qty')}</Label>
                <Input id="offer-qty" inputMode="numeric" value={offerQty} onChange={(e) => setOfferQty(e.target.value.replace(/\D/g, '').slice(0, 2))} className="h-10 bg-card" />
              </div>
              <Button type="submit" className="h-10" disabled={offer.isPending || !offerPrice}>{t('Send offer')}</Button>
            </form>
          )}
          <form
            className={cn('flex items-end gap-1.5', recorder.recording && 'hidden')}
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) send.mutate()
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) photo.mutate(f)
                e.target.value = ''
              }}
            />
            <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full text-muted-foreground" aria-label={t('Send a photo')} disabled={photo.isPending} onClick={() => fileRef.current?.click()}>
              {photo.isPending ? <Loader2 className="animate-spin" /> : <Camera className="size-5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-10 shrink-0 rounded-full', offerOpen ? 'bg-amber-soft text-amber-ink' : 'text-muted-foreground')}
              aria-label={t('Make an offer')}
              title={t('Make an offer')}
              aria-expanded={offerOpen}
              onClick={() => setOfferOpen(!offerOpen)}
            >
              <HandCoins className="size-5" />
            </Button>
            <label className="flex min-w-0 flex-1 items-end rounded-3xl border bg-background px-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
              <span className="sr-only">{t('Message')}</span>
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  if (e.target.value) typingPing()
                }}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter starts a new line
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    if (text.trim() && !send.isPending) send.mutate()
                  }
                }}
                placeholder={t('Write a message…')}
                maxLength={2000}
                className="block max-h-32 min-h-11 w-full resize-none bg-transparent py-3 text-[15px] leading-snug outline-none placeholder:text-muted-foreground"
              />
            </label>
            {text.trim() ? (
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" aria-label={t('Send')} disabled={send.isPending}>
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send className="size-[18px]" />}
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="size-10 shrink-0 rounded-full bg-muted text-foreground hover:bg-accent"
                aria-label={t('Record a voice message')}
                title={t('Tap to record a voice message')}
                disabled={voice.isPending}
                onClick={startRecording}
              >
                {voice.isPending ? <Loader2 className="animate-spin" /> : <Mic className="size-[18px]" />}
              </Button>
            )}
          </form>
        </div>
      )}

      {c && <ContactDialog id={id} open={contactOpen} onOpenChange={setContactOpen} name={c.otherName} />}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Report this conversation')}</DialogTitle>
            <DialogDescription>{t('Our team will read this conversation and act. The other person isn’t told who reported it.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('What happened?')}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFF_PLATFORM_PAYMENT">{t('Asked me to pay outside Sodo Gebeya')}</SelectItem>
                  <SelectItem value="SCAM">{t('Looks like a scam')}</SelectItem>
                  <SelectItem value="ABUSE">{t('Rude or abusive')}</SelectItem>
                  <SelectItem value="SPAM">{t('Spam')}</SelectItem>
                  <SelectItem value="OTHER">{t('Something else')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">{t('Details (optional)')}</Label>
              <Textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>{t('Cancel')}</Button>
            <Button onClick={() => report.mutate()} disabled={report.isPending}>{t('Send report')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
