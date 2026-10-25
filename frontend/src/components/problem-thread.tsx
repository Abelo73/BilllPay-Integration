import { useQuery } from '@tanstack/react-query'
import { ImageOff, Loader2, Send } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PROBLEM_STATUS_LABEL, REASON_LABEL, type Problem } from '@/lib/dispute-api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const WHO: Record<Problem['viewer'], string> = { BUYER: 'Buyer', SELLER: 'Seller', STAFF: 'Sodo Gebeya' }

/** The problem, its photos and the conversation; shared by the buyer, the seller and staff pages. */
export function ProblemThread({
  p,
  loadPhoto,
  onSend,
  sending,
}: {
  p: Problem
  loadPhoto: (photoId: number) => Promise<string>
  onSend?: (body: string) => void
  sending?: boolean
}) {
  const t = useT()
  const [text, setText] = useState('')
  const open = p.status === 'OPEN'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', open ? 'bg-market/20 text-market-deep' : 'bg-primary/10 text-primary')}>
          {t(PROBLEM_STATUS_LABEL[p.status])}
        </span>
        <span className="text-sm text-muted-foreground">
          {t(REASON_LABEL[p.reason])} · {t('order {number}', { number: p.parcelNumber })} · {p.shopName} · {formatETB(p.parcelTotal)}
        </span>
      </div>

      {!open && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-semibold">
            {p.status === 'WITHDRAWN' ? t('The buyer closed this problem.') : p.refundAmount ? t('Settled: {amount} back to the buyer.', { amount: formatETB(p.refundAmount) }) : t('Settled.')}
          </p>
          {p.decisionNote && <p className="text-muted-foreground">{p.decisionNote}</p>}
        </div>
      )}

      <div className="rounded-xl bg-muted/50 p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('What happened')} · {formatDate(p.createdAt)}</p>
        <p className="mt-1 whitespace-pre-line">{p.details}</p>
        <p className="mt-2 text-xs text-muted-foreground">{p.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</p>
      </div>

      {p.photoIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {p.photoIds.map((id) => <PrivatePhoto key={id} cacheKey={`${p.viewer}-${p.id}-${id}`} load={() => loadPhoto(id)} />)}
        </div>
      )}

      <ol className="space-y-2" aria-label={t('Conversation')}>
        {p.messages.map((m) => {
          const mine = m.author === p.viewer
          return (
            <li key={m.id} className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'ml-auto bg-primary text-primary-foreground' : m.author === 'STAFF' ? 'border border-market/50 bg-market/10' : 'bg-muted')}>
              <p className={cn('text-[11px] font-semibold', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {m.authorName ?? t(WHO[m.author])} · {formatDate(m.createdAt)}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          )
        })}
      </ol>

      {open && onSend && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) {
              onSend(text.trim())
              setText('')
            }
          }}
        >
          <Textarea rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Write a message…')} aria-label={t('Message')} />
          <Button type="submit" size="icon" aria-label={t('Send')} disabled={!text.trim() || sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      )}
    </div>
  )
}

function PrivatePhoto({ cacheKey, load }: { cacheKey: string; load: () => Promise<string> }) {
  const t = useT()
  const q = useQuery({ queryKey: ['private-photo', cacheKey], queryFn: load, staleTime: Infinity, retry: false })
  if (q.isLoading) return <div className="size-24 animate-pulse rounded-xl bg-muted" />
  if (!q.data) return <div className="grid size-24 place-items-center rounded-xl bg-muted"><ImageOff className="size-5 text-muted-foreground" /></div>
  return (
    <a href={q.data} target="_blank" rel="noreferrer">
      <img src={q.data} alt={t('Photo of the problem')} className="size-24 rounded-xl object-cover ring-1 ring-border" />
    </a>
  )
}
