import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { chatApi, type Conversation } from '@/lib/chat-api'
import { t as tNow, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'buying', label: 'Buying' },
  { key: 'selling', label: 'Selling' },
] as const

/** "12:41", "Yesterday", "Mon" or "12 Oct", like a phone's chat list. */
export function chatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return tNow('Yesterday')
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function Row({ c }: { c: Conversation }) {
  const t = useT()
  return (
    <Link
      to={`/chats/${c.id}`}
      className="flex gap-3 border-b px-2 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
    >
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold',
          c.side === 'BUYER' ? 'bg-primary text-primary-foreground' : 'bg-amber-soft text-amber-ink',
        )}
      >
        {initials(c.otherName)}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[15px]', c.unread ? 'font-extrabold' : 'font-semibold')}>{c.otherName}</span>
          <span className={cn('shrink-0 text-xs', c.unread ? 'font-bold text-brand' : 'text-muted-foreground')}>{chatTime(c.lastMessageAt)}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {c.side === 'SELLER' ? t('Selling') : t('Buying')}
          {c.product ? ` · ${c.product.name}` : ''}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', c.unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {c.blockedBy ? t('Blocked') : (c.lastMessagePreview ?? t('Say hello'))}
          </span>
          {c.unread && <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label={t('Unread')} />}
        </span>
      </span>
    </Link>
  )
}

/** Chat list (design S11). */
export function ChatsPage() {
  const t = useT()
  const session = useSession((s) => s.session)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const { data, isLoading } = useQuery({
    queryKey: ['chats', filter],
    queryFn: () => chatApi.list(filter),
    enabled: !!session,
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  if (!session) return <Navigate to="/login?next=/chats" replace />

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('Chats')}</h1>
      <div className="flex gap-2" role="group" aria-label={t('Show')}>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            aria-pressed={filter === f.key}
            className="h-9 rounded-full px-4"
            onClick={() => setFilter(f.key)}
          >
            {t(f.label)}
          </Button>
        ))}
      </div>
      <div className="rounded-2xl border bg-card px-2">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading…')}</p>}
        {data?.content.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <MessageCircle className="size-8 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              {t('No chats yet. Open a product and tap “Chat with seller” to ask a question or make an offer.')}
            </p>
            <Button asChild>
              <Link to="/shop">{t('Browse products')}</Link>
            </Button>
          </div>
        )}
        {data?.content.map((c) => <Row key={c.id} c={c} />)}
      </div>
    </div>
  )
}
