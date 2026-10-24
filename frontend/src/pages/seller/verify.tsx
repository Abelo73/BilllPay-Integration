import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, Check, Clock, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { ID_TYPE_LABEL, verificationApi, type IdType, type MyVerification, type VerificationPhoto } from '@/lib/trust-api'
import { cn } from '@/lib/utils'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** One photo slot: shows the uploaded photo (fetched privately) or a camera button. */
function PhotoSlot({ photo, label, has, editable, onUploaded }: {
  photo: VerificationPhoto
  label: string
  has: boolean
  editable: boolean
  onUploaded: (v: MyVerification) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!has) return
    let url: string | null = null
    verificationApi.photo(photo).then((u) => { url = u; setPreview(u) }, () => setPreview(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [has, photo, version])
  const upload = useMutation({
    mutationFn: (f: File) => verificationApi.upload(photo, f),
    onSuccess: (v) => { onUploaded(v); setVersion((n) => n + 1) },
    onError: (e) => toast.error(e.message),
  })
  const pick = (f?: File) => {
    if (!f) return
    if (!TYPES.includes(f.type)) return toast.error('Use a JPG, PNG or WebP photo.')
    if (f.size > MAX_BYTES) return toast.error('That photo is larger than 5 MB.')
    upload.mutate(f)
  }
  return (
    <button
      type="button"
      disabled={!editable || upload.isPending}
      onClick={() => input.current?.click()}
      className={cn(
        'relative flex h-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl text-xs font-semibold',
        has ? 'ring-2 ring-primary' : 'border-2 border-dashed bg-muted/40 text-muted-foreground',
      )}
    >
      {preview && has ? <img src={preview} alt="" className="absolute inset-0 size-full object-cover" /> : <Camera className="size-5" />}
      <span className={cn('relative', preview && has && 'rounded bg-black/60 px-1.5 py-0.5 text-white')}>
        {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : has ? `${label} ✓` : label}
      </span>
      <input ref={input} type="file" accept={TYPES.join(',')} capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </button>
  )
}

function Step({ n, done, title, text, children }: { n: number; done: boolean; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className={cn('space-y-3 rounded-2xl border bg-card p-4', !done && children && 'border-2 border-primary/60')}>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold', done ? 'bg-primary text-primary-foreground' : 'border-2 text-muted-foreground')}>
          {done ? <Check className="size-4" /> : n}
        </span>
        <span>
          <span className="block text-sm font-bold">{title}</span>
          <span className="block text-xs text-muted-foreground">{text}</span>
        </span>
      </div>
      {children}
    </li>
  )
}

/** /seller/verify: get the Verified badge (design S18). */
export function SellerVerifyPage() {
  const qc = useQueryClient()
  const { data: v, isLoading } = useQuery({ queryKey: ['seller-verification'], queryFn: verificationApi.get })
  const [details, setDetails] = useState<string | null>(null)
  const set = (next: MyVerification) => qc.setQueryData(['seller-verification'], next)
  const saveType = useMutation({ mutationFn: (t: IdType) => verificationApi.details(t, details ?? v?.details ?? ''), onSuccess: set, onError: (e) => toast.error(e.message) })
  const submit = useMutation({
    mutationFn: async () => {
      if (details !== null && details !== (v?.details ?? '')) await verificationApi.details(v!.idType, details)
      return verificationApi.submit()
    },
    onSuccess: (next) => { set(next); toast.success('Sent. Our team checks it within a day; we\'ll text you.') },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || !v) return <Skeleton className="h-96 rounded-2xl" />

  if (v.shopVerifiedAt) {
    return (
      <div className="flex gap-3 rounded-2xl bg-primary/10 p-5">
        <BadgeCheck className="size-8 shrink-0 text-primary" />
        <div>
          <p className="font-bold">Your shop is verified</p>
          <p className="text-sm text-muted-foreground">Since {formatDate(v.shopVerifiedAt)}. Buyers see the badge on your shop and products.</p>
        </div>
      </div>
    )
  }
  if (v.status === 'SUBMITTED') {
    return (
      <div className="flex gap-3 rounded-2xl bg-amber-soft p-5 text-amber-ink">
        <Clock className="size-6 shrink-0" />
        <div>
          <p className="font-bold">Our team is checking your documents</p>
          <p className="text-sm">Sent {formatDate(v.submittedAt)}. We'll text you, usually within a day.</p>
        </div>
      </div>
    )
  }

  const editable = v.status !== 'APPROVED'
  const twoSided = v.idType !== 'PASSPORT'
  const ready = v.idFront && v.selfie && (!twoSided || v.idBack)

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div className="flex gap-3 rounded-2xl bg-primary/10 p-4">
        <ShieldCheck className="size-9 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-bold">Buyers trust verified sellers more</p>
          <p className="text-sm text-muted-foreground">Get the Verified badge on your shop and products. Your ID is never shown to buyers: only Sodo Gebeya staff see it.</p>
        </div>
      </div>
      {(v.status === 'MORE_INFO' || v.status === 'REJECTED') && v.staffNote && (
        <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <span className="font-bold">{v.status === 'MORE_INFO' ? 'Please fix: ' : 'Not verified: '}</span>{v.staffNote}
          {v.status === 'REJECTED' && ' You can try again with new photos.'}
        </p>
      )}
      <ol className="space-y-3">
        <Step n={1} done title="Phone number" text="Proven when you signed in" />
        <Step n={2} done={v.idFront && (!twoSided || v.idBack)} title="ID card" text={twoSided ? 'Both sides, all four corners, readable' : 'The photo page'}>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ID_TYPE_LABEL) as IdType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => saveType.mutate(t)}
                className={cn('h-9 rounded-full border px-3 text-xs font-semibold', v.idType === t ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground')}
              >
                {ID_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PhotoSlot photo="id-front" label={twoSided ? 'Front side' : 'Photo page'} has={v.idFront} editable={editable} onUploaded={set} />
            {twoSided && <PhotoSlot photo="id-back" label="Back side" has={v.idBack} editable={editable} onUploaded={set} />}
          </div>
        </Step>
        <Step n={3} done={v.selfie} title="Selfie holding your ID" text="So we know the ID is yours">
          <div className="grid grid-cols-2 gap-2">
            <PhotoSlot photo="selfie" label="Selfie" has={v.selfie} editable={editable} onUploaded={set} />
          </div>
        </Step>
        <Step n={4} done={!!(v.licence || v.details)} title="Shop details (optional)" text="Trade licence photo or number, or where your shop is">
          <div className="grid grid-cols-2 gap-2">
            <PhotoSlot photo="licence" label="Trade licence" has={v.licence} editable={editable} onUploaded={set} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verify-details" className="text-xs">Anything that helps us check</Label>
            <Textarea id="verify-details" rows={2} maxLength={1000} value={details ?? v.details ?? ''} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Licence no. 12/345, shop opposite Arada church" />
          </div>
        </Step>
      </ol>
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button size="lg" className="h-12 w-full text-base md:w-auto" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending && <Loader2 className="animate-spin" />} {ready ? 'Send for checking' : 'Add the photos above first'}
        </Button>
      </div>
    </div>
  )
}
