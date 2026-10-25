import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { OrderStatusView } from '@/lib/api'
import { PROBLEM_STATUS_LABEL, REASON_LABEL, problemApi, type ProblemReason } from '@/lib/dispute-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/**
 * On a paid order: "Report a problem" per seller parcel, and the problems already reported. Only for the signed-in
 * buyer; the seller isn't paid while a problem is open.
 */
export function OrderProblems({ o }: { o: OrderStatusView }) {
  const session = useSession((s) => s.session)
  const reports = useQuery({ queryKey: ['order-problems', o.orderNumber], queryFn: () => problemApi.forOrder(o.orderNumber), enabled: !!session, retry: false })
  const [reporting, setReporting] = useState<{ parcelNo: number; seller: string } | null>(null)
  if (!session || !o.paidAt || !o.parcels?.length || reports.isError) return null
  const list = reports.data ?? []
  const openFor = (parcelNo: number) => list.some((r) => r.status === 'OPEN' && r.parcelNumber.endsWith(`-${parcelNo}`))

  return (
    <div className="space-y-2">
      {list.map((r) => (
        <Link key={r.id} to={`/problems/${r.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/50">
          <AlertTriangle className={cn('size-4 shrink-0', r.status === 'OPEN' ? 'text-market-deep' : 'text-muted-foreground')} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{REASON_LABEL[r.reason]} · {r.shopName}</span>
            <span className="block text-xs text-muted-foreground">{PROBLEM_STATUS_LABEL[r.status]}{r.status === 'OPEN' && (r.sellerRepliedAt ? ' · the seller answered' : ' · waiting for the seller')}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ))}
      <div className="flex flex-wrap gap-2">
        {o.parcels.filter((p) => p.fulfilmentStatus !== 'CANCELLED' && !openFor(p.parcelNo)).map((p) => (
          <Button key={p.parcelNo} variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => setReporting({ parcelNo: p.parcelNo, seller: p.seller ?? 'Sodo Gebeya' })}>
            <AlertTriangle /> Report a problem{o.parcels.length > 1 ? ` with ${p.seller ?? 'Sodo Gebeya'}` : ''}
          </Button>
        ))}
      </div>
      {reporting && <ReportDialog o={o} parcelNo={reporting.parcelNo} seller={reporting.seller} onClose={() => setReporting(null)} />}
    </div>
  )
}

function ReportDialog({ o, parcelNo, seller, onClose }: { o: OrderStatusView; parcelNo: number; seller: string; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [reason, setReason] = useState<ProblemReason | null>(null)
  const [details, setDetails] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const open = useMutation({
    mutationFn: async () => {
      const p = await problemApi.open(o.orderNumber, parcelNo, reason!, details)
      for (const f of files) await problemApi.addPhoto(p.id, f).catch(() => toast.warning('A photo could not be added'))
      return p
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['order-problems', o.orderNumber] })
      toast.success('Sent. The seller isn’t paid until this is settled.')
      navigate(`/problems/${p.id}`)
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>About your items from {seller}. The seller answers here, and our team decides if needed. Your money stays safe meanwhile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="What went wrong">
            {(Object.keys(REASON_LABEL) as ProblemReason[]).map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}
                className={cn('rounded-lg border px-3 py-2 text-left text-sm', reason === r ? 'border-2 border-primary bg-primary/5 font-semibold text-primary' : 'hover:bg-muted')}>
                {REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <Textarea rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened? e.g. the screen was cracked when I opened the box." aria-label="Details" />
          <label className="block text-sm">
            <span className="font-medium">Photos (optional, up to 4)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-1 block text-sm"
              onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 4))} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!reason || details.trim().length < 10 || open.isPending} onClick={() => open.mutate()}>
            {open.isPending && <Loader2 className="animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
