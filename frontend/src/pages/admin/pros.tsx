import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, PauseCircle, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Page } from '@/lib/api'
import { staffRequest } from '@/lib/chat-admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { TRADE_LABEL, type ProDetail } from '@/lib/services-api'
import { PageHeader, Pager, StatusBadge } from './shared'

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', ''] as const

const prosApi = {
  list: (status: string, page: number) => staffRequest<Page<ProDetail>>(`/pros?${status ? `status=${status}&` : ''}page=${page}`),
  decide: (id: number, status: string, note: string) =>
    staffRequest<ProDetail>(`/pros/${id}/decision`, { method: 'POST', body: JSON.stringify({ status, note }) }),
}

function ProRow({ p }: { p: ProDetail }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(p.statusNote ?? '')
  const decide = useMutation({
    mutationFn: (status: string) => prosApi.decide(p.card.id, status, note),
    onSuccess: (d) => {
      toast.success(`${d.card.displayName}: ${d.status?.toLowerCase()}`)
      qc.invalidateQueries({ queryKey: ['admin-pros'] })
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold">{p.card.displayName} <span className="font-normal text-muted-foreground">· {TRADE_LABEL[p.card.trade]}</span></p>
            <p className="text-sm text-muted-foreground">{p.card.headline}</p>
            <p className="text-xs text-muted-foreground">{p.phone} · {p.card.areas ?? 'no area'} · {p.card.yearsExperience ?? '?'} years · applied {formatDate(p.createdAt)}</p>
          </div>
          {p.status && <StatusBadge status={p.status} />}
        </div>
        {p.bio && <p className="whitespace-pre-wrap text-sm">{p.bio}</p>}
        {p.prices.length > 0 && (
          <ul className="text-sm">
            {p.prices.map((l) => <li key={l.label} className="flex justify-between border-b py-1 last:border-0"><span>{l.label}</span><span className="font-semibold">{l.priceFrom ? `from ${formatETB(l.priceFrom)}` : 'quote'}</span></li>)}
          </ul>
        )}
        {p.photos.length > 0 && (
          <div className="flex gap-2">{p.photos.map((ph) => <img key={ph.id} src={ph.url} alt="Past work" className="size-20 rounded-lg object-cover" />)}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 min-w-56 flex-1" placeholder="Note to the pro (required to reject or pause)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <Button size="sm" disabled={decide.isPending || p.status === 'APPROVED'} onClick={() => decide.mutate('APPROVED')}>
            {decide.isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
          <Button size="sm" variant="outline" disabled={decide.isPending || !note.trim()} onClick={() => decide.mutate('REJECTED')}><X /> Reject</Button>
          <Button size="sm" variant="outline" disabled={decide.isPending || !note.trim() || p.status !== 'APPROVED'} onClick={() => decide.mutate('SUSPENDED')}><PauseCircle /> Pause</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Staff: approve skilled workers before their profiles show in "Hire a pro". */
export function AdminProsPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('PENDING')
  const [page, setPage] = useState(0)
  const { data } = useQuery({ queryKey: ['admin-pros', status, page], queryFn: () => prosApi.list(status, page), placeholderData: keepPreviousData })
  return (
    <>
      <PageHeader title="Pros" description="Skilled workers (electricians, tailors, …). Approve a profile before it shows in Hire a pro. The pro gets an SMS." />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s || 'all'} size="sm" variant={status === s ? 'default' : 'outline'} aria-pressed={status === s} onClick={() => { setStatus(s); setPage(0) }}>
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
        {data?.content.map((p) => <ProRow key={p.card.id} p={p} />)}
      </div>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={setPage} />}
    </>
  )
}
