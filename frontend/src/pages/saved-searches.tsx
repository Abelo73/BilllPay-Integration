import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Bookmark, MessageSquareText, Search, Trash2 } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/i18n'
import { searchApi, type SavedSearch } from '@/lib/search-api'
import { useSession } from '@/store/session'

/** /searches: my saved searches, with how many new listings each has, and their alerts. */
export function SavedSearchesPage() {
  const t = useT()
  const session = useSession((s) => s.session)
  const q = useQuery({ queryKey: ['saved-searches'], queryFn: searchApi.mine, enabled: !!session })
  if (!session) return <Navigate to="/login?next=/searches" replace />
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Bookmark className="size-6 text-primary" /> {t('Saved searches')}</h1>
        <p className="text-muted-foreground">{t('We tell you when new listings match. Save a search from the Shop page.')}</p>
      </div>
      {q.isLoading && <Skeleton className="h-24 rounded-2xl" />}
      {q.data?.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground">{t('No saved searches yet.')}</p>
          <Button asChild><Link to="/shop"><Search /> {t('Go to the shop')}</Link></Button>
        </div>
      )}
      <ul className="space-y-3">{q.data?.map((s) => <Row key={s.id} s={s} />)}</ul>
    </div>
  )
}

function Row({ s }: { s: SavedSearch }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved-searches'] })
  const update = useMutation({ mutationFn: (b: { alertInbox?: boolean; alertSms?: boolean }) => searchApi.update(s.id, b), onSuccess: refresh, onError: (e) => toast.error(e.message) })
  const remove = useMutation({ mutationFn: () => searchApi.remove(s.id), onSuccess: () => { refresh(); toast.success(t('Deleted')) } })
  const open = async () => {
    await searchApi.seen(s.id).catch(() => undefined)
    refresh()
    navigate(s.link)
  }
  const details = [
    s.q && `“${s.q}”`,
    ...Object.values(s.specs).map((v) => (Array.isArray(v) ? v.join(', ') : String(v))),
    s.minPrice != null && s.maxPrice != null ? t('{a}–{b} birr', { a: s.minPrice, b: s.maxPrice }) : s.minPrice != null ? t('from {a} birr', { a: s.minPrice }) : s.maxPrice != null ? t('up to {b} birr', { b: s.maxPrice }) : null,
  ].filter(Boolean)
  return (
    <li className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2 font-bold hover:text-primary">
            {s.name}
            {s.newCount > 0 && <span className="rounded-full bg-market px-2 py-0.5 text-xs font-bold text-[#13201A]">{t('{n} new', { n: s.newCount })}</span>}
          </span>
          <span className="block text-sm text-muted-foreground">{details.join(' · ') || (s.category ?? '')}</span>
        </button>
        <Button variant="ghost" size="icon-sm" aria-label={t('Delete')} className="text-destructive" onClick={() => remove.mutate()}><Trash2 /></Button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><Bell className="size-4 text-muted-foreground" /> {t('Notifications')}
          <Switch checked={s.alertInbox} onCheckedChange={(v) => update.mutate({ alertInbox: v })} />
        </label>
        <label className="flex items-center gap-2"><MessageSquareText className="size-4 text-muted-foreground" /> {t('SMS (once a day)')}
          <Switch checked={s.alertSms} onCheckedChange={(v) => update.mutate({ alertSms: v })} />
        </label>
      </div>
    </li>
  )
}
