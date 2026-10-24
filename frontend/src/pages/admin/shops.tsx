import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ExternalLink, Loader2, Package, RotateCcw, Search, Store, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { VerifiedBadge } from '@/components/verified-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isAdmin, shopAdminApi, type AdminShopRow } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { KIND_LABEL, SHOP_STATUS_LABEL, type ShopStatus } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { PageHeader, Pager } from './shared'

const TABS: { value: string; label: string }[] = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Open' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'SUSPENDED', label: 'Paused' },
  { value: 'all', label: 'All' },
]

const STATUS_STYLE: Record<ShopStatus, string> = {
  PENDING: 'border-warning/40 bg-warning/15',
  APPROVED: 'border-success/30 bg-success/15 text-success',
  REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
  SUSPENDED: 'bg-muted text-muted-foreground',
}

export function ShopStatusBadge({ status }: { status: ShopStatus }) {
  return <Badge variant="outline" className={STATUS_STYLE[status]}>{SHOP_STATUS_LABEL[status]}</Badge>
}

type Decision = { row: AdminShopRow; to: 'REJECTED' | 'SUSPENDED' }

/** Reject or pause needs a reason: the seller reads it in the SMS and on their shop page. */
function ReasonDialog({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const reject = decision.to === 'REJECTED'
  const save = useMutation({
    mutationFn: () => shopAdminApi.decide(decision.row.shop.id, decision.to, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-shops'] })
      toast.success(reject ? 'Not approved. The seller got an SMS with your reason.' : 'Shop paused and hidden from the store.')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reject ? 'Not approve' : 'Pause'} {decision.row.shop.name}?</DialogTitle>
          <DialogDescription>
            {reject
              ? 'The seller can fix the details and send it again.'
              : 'Its products disappear from the store until you open it again. Paid orders still need delivering.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason (the seller sees this)</Label>
          <Textarea
            id="reason"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reject ? 'e.g. Add the shop\'s area and a real phone number' : 'e.g. Several buyers reported fake products'}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" disabled={!note.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} {reject ? 'Not approve' : 'Pause shop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShopCard({ row, onDecide }: { row: AdminShopRow; onDecide: (d: Decision) => void }) {
  const qc = useQueryClient()
  const s = row.shop
  const approve = useMutation({
    mutationFn: () => shopAdminApi.decide(s.id, 'APPROVED'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-shops'] })
      toast.success(`${s.name} is open. The seller got an SMS.`)
    },
    onError: (e) => toast.error(e.message),
  })
  const admin = isAdmin()
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        {s.logoUrl ? (
          <img src={s.logoUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-border" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Store className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{s.name}</p>
            <ShopStatusBadge status={s.status} />
            {s.verifiedAt && <VerifiedBadge />}
            <span className="text-xs text-muted-foreground">{KIND_LABEL[s.kind]}{s.area && ` · ${s.area}`}</span>
          </div>
          {s.description && <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{row.owner?.fullName ?? '–'} {row.owner?.email && <span className="text-muted-foreground">· {row.owner.email}</span>}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Shop phone</dt>
              <dd className="tabular-nums">{s.phone ?? '–'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Products</dt>
              <dd className="tabular-nums">{row.products} ({row.productsInStore} switched on)</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Opened</dt>
              <dd>{formatDate(s.createdAt)}</dd>
            </div>
            {s.addressLine && (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{s.addressLine}</dd>
              </div>
            )}
            {s.decidedAt && (
              <div>
                <dt className="text-muted-foreground">Decided</dt>
                <dd>{formatDate(s.decidedAt)} · {row.decidedBy}</dd>
              </div>
            )}
          </dl>
          {s.statusNote && (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs"><span className="font-medium">Reason given:</span> {s.statusNote}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:w-40 sm:flex-col">
          {admin && s.status !== 'APPROVED' && (
            <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? <Loader2 className="animate-spin" /> : s.status === 'PENDING' ? <Check /> : <RotateCcw />}
              {s.status === 'PENDING' ? 'Approve' : 'Open again'}
            </Button>
          )}
          {admin && s.status === 'PENDING' && (
            <Button size="sm" variant="outline" onClick={() => onDecide({ row, to: 'REJECTED' })}><X /> Not approve</Button>
          )}
          {admin && s.status === 'APPROVED' && (
            <Button size="sm" variant="outline" onClick={() => onDecide({ row, to: 'SUSPENDED' })}><Ban /> Pause</Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to={`/admin/products?seller=${s.id}`}><Package /> Products</Link>
          </Button>
          {s.status === 'APPROVED' && (
            <Button asChild size="sm" variant="ghost">
              <a href={`/shops/${s.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Shop page</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AdminShopsPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'PENDING'
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)
  const [decision, setDecision] = useState<Decision | null>(null)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = setTimeout(() => search !== q && set('q', search || null), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-shops', status, q, page],
    queryFn: () => shopAdminApi.list({ status: status === 'all' ? undefined : status, q, page }),
    placeholderData: keepPreviousData,
  })
  const counts = data?.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHeader
        title="Sellers"
        description="Shops and people selling on Sodo Gebeya. Their products show in the store only once approved."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={status} onValueChange={(v) => set('status', v === 'PENDING' ? null : v)}>
          <TabsList className="flex-wrap">
            {TABS.map((t) => {
              const n = t.value === 'all' ? total : counts[t.value] ?? 0
              return (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  <span className={cn('ml-1 tabular-nums text-muted-foreground', t.value === 'PENDING' && n > 0 && 'font-semibold text-foreground')}>
                    {n}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64 lg:ml-auto">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Shop name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="space-y-3">
        {!isLoading && data?.page.content.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {status === 'PENDING' ? 'No shops waiting. All caught up.' : 'No shops here.'}
            </CardContent>
          </Card>
        )}
        {data?.page.content.map((row) => <ShopCard key={row.shop.id} row={row} onDecide={setDecision} />)}
      </div>
      {data && (
        <Pager page={page} totalPages={data.page.totalPages} total={data.page.totalElements} size={data.page.size} onPage={(p) => set('page', String(p))} />
      )}
      {decision && <ReasonDialog decision={decision} onClose={() => setDecision(null)} />}
    </>
  )
}
