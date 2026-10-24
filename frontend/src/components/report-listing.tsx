import { useMutation } from '@tanstack/react-query'
import { Flag, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { publicTrustApi, REPORT_REASON_LABEL, type ReportReason } from '@/lib/trust-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** "Report this listing": signed-in shoppers tell Sodo Gebeya about scams, fakes or banned items. */
export function ReportListing({ productId, slug }: { productId: number; slug: string }) {
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const send = useMutation({
    mutationFn: () => publicTrustApi.report(productId, reason!, details),
    onSuccess: () => {
      setOpen(false)
      toast.success('Thanks. Our team will look at this listing.')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ALREADY_REPORTED') setOpen(false)
      toast.error(e.message)
    },
  })
  const start = () => {
    if (!session) return navigate(`/login?next=${encodeURIComponent(`/product/${slug}`)}`)
    setOpen(true)
  }
  return (
    <>
      <button type="button" onClick={start} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive">
        <Flag className="size-3.5" /> Report this listing
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this listing</DialogTitle>
            <DialogDescription>Only Sodo Gebeya sees your report, not the seller.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2" role="radiogroup" aria-label="Reason">
            {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={cn('h-11 rounded-lg border px-3 text-left text-sm font-medium', reason === r ? 'border-2 border-primary bg-primary/5' : 'bg-card')}
              >
                {REPORT_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">What's wrong? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!reason || send.isPending} onClick={() => send.mutate()}>
              {send.isPending && <Loader2 className="animate-spin" />} Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
