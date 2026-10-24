import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImageOff, Loader2, MessageSquareWarning, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { VerifiedBadge } from '@/components/verified-badge'
import { isAdmin } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { KIND_LABEL } from '@/lib/seller-api'
import { ID_TYPE_LABEL, trustAdminApi, type VerificationPhoto, type VerificationRow } from '@/lib/trust-api'
import { cn } from '@/lib/utils'
import { PageHeader, Pager } from './shared'

const TABS = [
  { value: 'SUBMITTED', label: 'Waiting' },
  { value: 'MORE_INFO', label: 'Asked for more' },
  { value: 'APPROVED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
]

/** A private ID photo: fetched with the staff token, shown from memory, opened large on click. */
function PrivatePhoto({ id, photo, label, has }: { id: number; photo: VerificationPhoto; label: string; has: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!has) return
    let u: string | null = null
    trustAdminApi.verificationPhoto(id, photo).then((x) => { u = x; setUrl(x) }, () => setUrl(null))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [id, photo, has])
  if (!has) {
    return (
      <span className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg bg-muted text-[11px] text-muted-foreground">
        <ImageOff className="size-4" /> No {label.toLowerCase()}
      </span>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="relative h-24 w-32 overflow-hidden rounded-lg ring-1 ring-border" aria-label={`Open ${label}`}>
        {url ? <img src={url} alt={label} className="size-full object-cover" /> : <Loader2 className="m-auto size-4 animate-spin" />}
        <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-semibold text-white">{label}</span>
      </button>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
          {url && <img src={url} alt={label} className="max-h-[75vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

type Decision = { row: VerificationRow; to: 'MORE_INFO' | 'REJECTED' }

function NoteDialog({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const more = decision.to === 'MORE_INFO'
  const save = useMutation({
    mutationFn: () => trustAdminApi.decideVerification(decision.row.id, decision.to, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-verifications'] }); toast.success('Sent. The seller got an SMS.'); onClose() },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{more ? 'Ask for a better photo' : 'Reject verification'}</DialogTitle>
          <DialogDescription>{decision.row.shop.name} · the seller reads this in an SMS and on their Get verified page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="v-note">{more ? 'What to fix' : 'Why'}</Label>
          <Textarea id="v-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={more ? 'e.g. The back of the ID is blurry; take it again in daylight' : 'e.g. The selfie and the ID show different people'} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant={more ? 'default' : 'destructive'} disabled={!note.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} {more ? 'Ask the seller' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ v, onDecide }: { v: VerificationRow; onDecide: (d: Decision) => void }) {
  const qc = useQueryClient()
  const approve = useMutation({
    mutationFn: () => trustAdminApi.decideVerification(v.id, 'APPROVED'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-verifications'] }); toast.success(`${v.shop.name} is verified. The seller got an SMS.`) },
    onError: (e) => toast.error(e.message),
  })
  const waiting = v.status === 'SUBMITTED'
  const twoSided = v.idType !== 'PASSPORT'
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="flex flex-wrap gap-2">
          <PrivatePhoto id={v.id} photo="id-front" label={twoSided ? 'ID front' : 'Photo page'} has={v.idFront} />
          {twoSided && <PrivatePhoto id={v.id} photo="id-back" label="ID back" has={v.idBack} />}
          <PrivatePhoto id={v.id} photo="selfie" label="Selfie" has={v.selfie} />
          {v.licence && <PrivatePhoto id={v.id} photo="licence" label="Licence" has />}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {v.shop.name} {v.shopVerifiedAt && <VerifiedBadge />}
            <span className="text-xs font-normal text-muted-foreground">{KIND_LABEL[v.shop.kind]}{v.shop.area && ` · ${v.shop.area}`}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {v.ownerName ?? '–'} · {ID_TYPE_LABEL[v.idType]} · phone {v.ownerPhoneVerified ? 'proven by SMS' : 'not proven'} · {v.shop.phone}
          </p>
          <p className="text-xs text-muted-foreground">
            Sent {formatDate(v.submittedAt)}{v.decidedAt && ` · decided ${formatDate(v.decidedAt)} by ${v.decidedBy}`}
          </p>
          {v.details && <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs"><span className="font-medium">Seller's note:</span> {v.details}</p>}
          {v.staffNote && <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs"><span className="font-medium">Our note:</span> {v.staffNote}</p>}
        </div>
        {waiting && isAdmin() && (
          <div className="flex shrink-0 flex-wrap gap-2 lg:w-48 lg:flex-col">
            <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide({ row: v, to: 'MORE_INFO' })}><MessageSquareWarning /> Ask for better photo</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDecide({ row: v, to: 'REJECTED' })}><X /> Reject</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin → Verifications (design S21): ID photos are private to staff and never cached. */
export function AdminVerificationsPage() {
  const [status, setStatus] = useState('SUBMITTED')
  const [page, setPage] = useState(0)
  const [decision, setDecision] = useState<Decision | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-verifications', status, page],
    queryFn: () => trustAdminApi.verifications(status, page),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader title="Verifications" description="Sellers who sent their ID for the Verified badge. Only staff ever see these photos." />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              <span className={cn('ml-1 tabular-nums text-muted-foreground', t.value === 'SUBMITTED' && (data?.counts.SUBMITTED ?? 0) > 0 && 'font-semibold text-foreground')}>
                {data?.counts[t.value] ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {!isLoading && data?.page.content.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{status === 'SUBMITTED' ? 'Nothing waiting. All caught up.' : 'None here.'}</CardContent></Card>
        )}
        {data?.page.content.map((v) => <Row key={v.id} v={v} onDecide={setDecision} />)}
      </div>
      {data && <Pager page={page} totalPages={data.page.totalPages} total={data.page.totalElements} size={data.page.size} onPage={setPage} />}
      {decision && <NoteDialog decision={decision} onClose={() => setDecision(null)} />}
    </>
  )
}
