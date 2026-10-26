import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Bookmark, CreditCard, Hammer, MessageCircle, Package, Star, Store, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { TelegramConnect } from '@/components/telegram-connect'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { formatDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { inboxApi, type InboxItem, type InboxKind, type NotificationPrefs } from '@/lib/inbox-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

const ICON: Record<InboxKind, typeof Bell> = {
  ORDER: Package,
  PAYMENT: CreditCard,
  DELIVERY: Truck,
  CHAT: MessageCircle,
  JOB: Hammer,
  SHOP: Store,
  REVIEW: Star,
  SYSTEM: Bell,
  ALERT: Bookmark,
}

function Row({ item }: { item: InboxItem }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const Icon = ICON[item.kind] ?? Bell
  const open = async () => {
    if (!item.read) {
      await inboxApi.read(item.id).catch(() => undefined)
      qc.invalidateQueries({ queryKey: ['inbox'] })
      qc.invalidateQueries({ queryKey: ['inbox-unread'] })
    }
    if (item.link) navigate(item.link)
  }
  return (
    <li>
      <button type="button" onClick={open} className={cn('flex w-full gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-primary/40', !item.read && 'border-primary/30 bg-accent/40')}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', item.read ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground')}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={cn('block text-sm', item.read ? 'font-semibold' : 'font-extrabold')}>{item.title}</span>
          {item.body && <span className="line-clamp-2 block text-sm text-muted-foreground">{item.body}</span>}
          <span className="block text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
        </span>
        {!item.read && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t('Unread')} />}
      </button>
    </li>
  )
}

function SmsChoices() {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notification-prefs'], queryFn: inboxApi.prefs })
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => inboxApi.savePrefs(p),
    onSuccess: (p) => { qc.setQueryData(['notification-prefs'], p); toast.success(t('Saved')) },
    onError: (e) => toast.error(e.message),
  })
  if (!data) return null
  const rows: [keyof NotificationPrefs, string, string][] = [
    ['smsOrders', t('Orders'), t('Payment received, on the way, delivered, finish-paying reminder')],
    ['smsChat', t('Chats'), t('When someone sends you a message (at most every few hours)')],
    ['smsJobs', t('Jobs'), t('New prices for your jobs, accepted prices, job requests')],
  ]
  return (
    <section aria-labelledby="sms-choices" className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 id="sms-choices" className="font-bold">{t('Text messages (SMS)')}</h2>
      <p className="text-sm text-muted-foreground">{t('You always see everything here in the app. Choose what we also send by SMS.')}</p>
      {rows.map(([key, title, hint]) => (
        <label key={key} className="flex items-center gap-3">
          <span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
          <Switch checked={data[key]} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ ...data, [key]: v })} />
        </label>
      ))}
    </section>
  )
}

/** Notifications (design S15). */
export function NotificationsPage() {
  const t = useT()
  const session = useSession((s) => s.session)
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const { data } = useQuery({ queryKey: ['inbox', page], queryFn: () => inboxApi.list(page), enabled: !!session, placeholderData: keepPreviousData, refetchInterval: 30_000 })
  const readAll = useMutation({
    mutationFn: () => inboxApi.read(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['inbox-unread'] }) },
  })
  if (!session) return <Navigate to="/login?next=/notifications" replace />
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('Notifications')}</h1>
        {!!data?.unread && <Button variant="ghost" onClick={() => readAll.mutate()}>{t('Mark all read')}</Button>}
      </div>
      {data?.items.content.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center">
          <Bell className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('Nothing yet. Order updates, messages and job prices show up here.')}</p>
          <Button asChild variant="outline"><Link to="/shop">{t('Browse products')}</Link></Button>
        </div>
      )}
      <ul className="space-y-2">{data?.items.content.map((i) => <Row key={i.id} item={i} />)}</ul>
      {data && data.items.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Newer')}</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= data.items.totalPages} onClick={() => setPage(page + 1)}>{t('Older')}</Button>
        </div>
      )}
      <TelegramConnect />
      <SmsChoices />
    </div>
  )
}
