import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, Loader2, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { VerifiedBadge } from '@/components/verified-badge'
import { isAdmin } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { REPORT_REASON_LABEL, trustAdminApi, type ListingReportRow, type ReportReason } from '@/lib/trust-api'
import { Thumb } from './products'
import { PageHeader, Pager } from './shared'

function HideDialog({ row, onClose }: { row: ListingReportRow; onClose: () => void }) {
  const qc = useQueryClient()
  const top = Object.keys(row.reasons)[0] as ReportReason | undefined
  const [note, setNote] = useState(top ? REPORT_REASON_LABEL[top] : '')
  const hide = useMutation({
    mutationFn: () => trustAdminApi.hideListing(row.productId, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-listing-reports'] }); toast.success('Taken down. The seller got an SMS with your reason.'); onClose() },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take down "{row.productName}"?</DialogTitle>
          <DialogDescription>It leaves the store at once. The seller can't show it again until you put it back here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="hide-note">Reason (the seller sees this)</Label>
          <Textarea id="hide-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" disabled={!note.trim() || hide.isPending} onClick={() => hide.mutate()}>
            {hide.isPending && <Loader2 className="animate-spin" />} Take down
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReportCard({ r, status, onHide }: { r: ListingReportRow; status: string; onHide: (r: ListingReportRow) => void }) {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['admin-listing-reports'] })
  const dismiss = useMutation({ mutationFn: () => trustAdminApi.dismissReports(r.productId), onSuccess: () => { done(); toast.success('Reports dismissed') }, onError: (e) => toast.error(e.message) })
  const unblock = useMutation({ mutationFn: () => trustAdminApi.unblockListing(r.productId), onSuccess: () => { done(); toast.success('Put back in the store') }, onError: (e) => toast.error(e.message) })
  const admin = isAdmin()
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
        <Thumb src={r.imageUrl} alt="" className="size-16 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/products/${r.productId}`} className="font-semibold hover:underline">{r.productName}</Link>
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{r.reports} {r.reports === 1 ? 'report' : 'reports'}</Badge>
            {r.blockedReason && <Badge variant="outline">taken down</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {r.shopName ?? 'Sodo Gebeya'} {r.shopVerified ? <VerifiedBadge compact /> : r.shopName && '· not verified'} · last report {formatDate(r.lastReportedAt)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(r.reasons).map(([reason, n]) => (
              <Badge key={reason} variant="secondary">{REPORT_REASON_LABEL[reason as ReportReason]} · {n}</Badge>
            ))}
          </div>
          {r.latest.filter((l) => l.details).slice(0, 3).map((l, i) => (
            <p key={i} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">"{l.details}"</p>
          ))}
          {r.blockedReason && <p className="text-xs"><span className="font-medium">Reason given:</span> {r.blockedReason}</p>}
        </div>
        {admin && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:w-40 sm:flex-col">
            {status === 'OPEN' && (
              <>
                <Button size="sm" variant="destructive" onClick={() => onHide(r)}><EyeOff /> Take down</Button>
                <Button size="sm" variant="outline" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}><X /> Dismiss</Button>
              </>
            )}
            {r.blockedReason && (
              <Button size="sm" variant="outline" onClick={() => unblock.mutate()} disabled={unblock.isPending}><RotateCcw /> Put back</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin → Listing reports (design S21): most reported first. */
export function AdminListingReportsPage() {
  const [status, setStatus] = useState('OPEN')
  const [page, setPage] = useState(0)
  const [hiding, setHiding] = useState<ListingReportRow | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-listing-reports', status, page],
    queryFn: () => trustAdminApi.reports(status, page),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader title="Listing reports" description="Listings shoppers reported. Take one down (the seller is told why) or dismiss the reports." />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
        <TabsList>
          <TabsTrigger value="OPEN">To decide <span className="ml-1 tabular-nums text-muted-foreground">{data?.open ?? 0}</span></TabsTrigger>
          <TabsTrigger value="HIDDEN">Taken down</TabsTrigger>
          <TabsTrigger value="DISMISSED">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {!isLoading && data?.page.content.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{status === 'OPEN' ? 'No open reports.' : 'None here.'}</CardContent></Card>
        )}
        {data?.page.content.map((r) => <ReportCard key={r.productId} r={r} status={status} onHide={setHiding} />)}
      </div>
      {data && <Pager page={page} totalPages={data.page.totalPages} total={data.page.totalElements} size={data.page.size} onPage={setPage} />}
      {hiding && <HideDialog row={hiding} onClose={() => setHiding(null)} />}
    </>
  )
}
