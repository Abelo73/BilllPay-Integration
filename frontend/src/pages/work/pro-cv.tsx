import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, FileText, Loader2, Sparkles, Upload, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import { CV_PACK_LABEL, CV_STATUS_LABEL, workApi, type CvOrder, type CvPack } from '@/lib/work-api'
import { useSession } from '@/store/session'
import { errorText, Notice, shortDate, WorkNav } from './shared'

const PACKS: { pack: CvPack; key: string; points: string[] }[] = [
  { pack: 'BASIC', key: 'cv_basic_price', points: ['CV written and designed for you', 'PDF and Word', '1 round of changes', 'Ready in 2 days'] },
  { pack: 'COVER', key: 'cv_cover_price', points: ['Everything in CV', 'A cover letter for your target job', '1 round of changes', 'Ready in 2 days'] },
  { pack: 'PREMIUM', key: 'cv_premium_price', points: ['CV + cover letter', 'English and Amharic versions', '2 rounds of changes', 'Ready in 3 days'] },
]

/** /work/cv: our team writes your CV (J5). With online payment off, paid by telebirr or bank and confirmed by staff. */
export function ProCvPage() {
  const f = useFeatures()
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orders = useQuery({ queryKey: ['work-cv-orders'], queryFn: workApi.cvOrders, enabled: !!session && session.user.role === 'CUSTOMER' })
  const [pack, setPack] = useState<CvPack>('BASIC')
  const [express, setExpress] = useState(false)
  const [language, setLanguage] = useState('EN')
  const [targetJob, setTargetJob] = useState('')
  const [details, setDetails] = useState('')
  const quote = useQuery({ queryKey: ['work-cv-quote', pack, express, !!session], queryFn: () => workApi.cvQuote(pack, express), enabled: f.on('cv_service') })
  const order = useMutation({
    mutationFn: () => workApi.orderCv({ pack, express, language: pack === 'PREMIUM' ? language : language === 'BOTH' ? 'EN' : language, targetJob, details }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-cv-orders'] })
      toast.success('Order placed. Pay to start, see below.')
      setTargetJob('')
      setDetails('')
    },
    onError: (e) => toast.error(errorText(e)),
  })

  if (f.loaded && !f.on('cv_service')) return <><WorkNav /><Notice title="Professional CVs are coming soon">Meanwhile, make your <a href="/work/my-cv" className="text-primary underline">free CV</a>.</Notice></>

  return (
    <>
      <WorkNav />
      <section className="bg-gradient-to-br from-primary to-[#13785A] text-primary-foreground">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-10 sm:px-6">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm"><Sparkles className="size-4 text-market" /> Professional CV</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Send us your details. We write your CV.</h1>
          <p className="max-w-2xl text-primary-foreground/80">
            Written and designed by our team, in English or Amharic.{f.on('student_badge') && <> Verified students get {f.number('student_discount')}% off.</>}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {PACKS.map((p) => (
            <button key={p.pack} type="button" onClick={() => setPack(p.pack)} aria-pressed={pack === p.pack}
              className={cn('relative space-y-3 rounded-3xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5',
                pack === p.pack ? 'border-primary ring-2 ring-primary/30' : 'hover:shadow-md')}>
              {p.pack === 'COVER' && <span className="absolute right-4 top-4 rounded-full bg-market px-2 py-0.5 text-xs font-bold text-[#13201A]">Popular</span>}
              <p className="font-bold">{CV_PACK_LABEL[p.pack]}</p>
              <p className="text-3xl font-extrabold">{f.loaded ? f.number(p.key) : '…'} <span className="text-base font-semibold text-muted-foreground">birr</span></p>
              <ul className="space-y-1.5 text-sm">
                {p.points.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{x}</li>)}
              </ul>
            </button>
          ))}
        </div>

        <form className="grid gap-6 rounded-3xl border bg-card p-5 sm:p-6 lg:grid-cols-[1fr_300px]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!session) navigate('/login?next=/work/cv')
            else order.mutate()
          }}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Your order: {CV_PACK_LABEL[pack]}</h2>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
              <span>
                <span className="flex items-center gap-1.5 font-medium"><Zap className="size-4 text-market" /> Express, ready in 24 hours</span>
                <span className="block text-sm text-muted-foreground">+{f.number('cv_express_fee')} birr</span>
              </span>
              <Switch checked={express} onCheckedChange={setExpress} />
            </label>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Language</legend>
              <div className="flex flex-wrap gap-2">
                {[['EN', 'English'], ['AM', 'Amharic'], ...(pack === 'PREMIUM' ? [['BOTH', 'Both']] : [])].map(([v, l]) => (
                  <Button key={v} type="button" size="sm" variant={language === v ? 'default' : 'outline'} aria-pressed={language === v} onClick={() => setLanguage(v)}>{l}</Button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="target">The job you want</Label>
              <Input id="target" maxLength={200} value={targetJob} onChange={(e) => setTargetJob(e.target.value)} className="h-11" placeholder="e.g. Accountant at a bank" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="details">Anything we should know</Label>
              <Textarea id="details" rows={4} maxLength={4000} value={details} onChange={(e) => setDetails(e.target.value)}
                placeholder="We start from your Sodo Gebeya profile. Add anything missing: achievements, trainings, references." />
              <p className="text-xs text-muted-foreground">After ordering you can upload your old CV or certificates.</p>
            </div>
          </div>
          <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
            <p className="font-bold">Price</p>
            {quote.data ? (
              <dl className="space-y-1 text-sm">
                <Row k={CV_PACK_LABEL[pack]} v={`${quote.data.price} birr`} />
                {quote.data.express && <Row k="Express" v={`${quote.data.expressFee} birr`} />}
                {quote.data.discountPercent > 0 && <Row k={`Student discount (${quote.data.discountPercent}%)`} v="applied" />}
                <div className="flex justify-between border-t pt-2 text-base font-extrabold"><dt>Total</dt><dd>{quote.data.total} birr</dd></div>
                <p className="flex items-center gap-1.5 pt-1 text-muted-foreground"><Clock className="size-3.5" /> Ready in {quote.data.days === 1 ? '24 hours' : `${quote.data.days} days`} after payment</p>
              </dl>
            ) : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
            <Button type="submit" className="w-full rounded-full" disabled={order.isPending}>{order.isPending && <Loader2 className="animate-spin" />}{session ? 'Order my CV' : 'Sign in to order'}</Button>
          </div>
        </form>

        {!!orders.data?.length && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">My CV orders</h2>
            {orders.data.map((o) => <OrderCard key={o.id} o={o} />)}
          </section>
        )}
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
}

function OrderCard({ o }: { o: CvOrder }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [ref, setRef] = useState(o.paymentReference ?? '')
  const [changes, setChanges] = useState('')
  const refresh = (n: CvOrder) => qc.setQueryData<CvOrder[]>(['work-cv-orders'], (all) => all?.map((x) => (x.id === n.id ? n : x)))
  const saveRef = useMutation({ mutationFn: () => workApi.cvReference(o.id, ref.trim()), onSuccess: (n) => { refresh(n); toast.success('Thanks! We confirm it soon.') }, onError: (e) => toast.error(errorText(e)) })
  const upload = useMutation({ mutationFn: (file: File) => workApi.cvFile(o.id, file), onSuccess: refresh, onError: (e) => toast.error(errorText(e)) })
  const respond = useMutation({
    mutationFn: (approve: boolean) => workApi.cvRespond(o.id, approve, approve ? undefined : changes),
    onSuccess: (n) => {
      refresh(n)
      qc.invalidateQueries({ queryKey: ['work-profile'] })
      toast.success(n.status === 'DONE' ? 'Done! Your CV is saved to your profile.' : 'Sent. We make your changes.')
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const changesLeft = o.changesAllowed - o.changesUsed
  const open = !['DONE', 'CANCELLED'].includes(o.status)

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-bold">#{o.id} · {CV_PACK_LABEL[o.pack]}{o.express && ' · Express'} · {o.total} birr</p>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', o.status === 'DONE' ? 'bg-primary text-primary-foreground' : o.status === 'DRAFT_SENT' ? 'bg-market/20 text-market-deep' : 'bg-muted')}>
          {CV_STATUS_LABEL[o.status]}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Ordered {shortDate(o.createdAt)}{o.dueAt && open && ` · due ${shortDate(o.dueAt)}`}</p>

      {o.status === 'AWAITING_PAYMENT' && (
        <div className="space-y-2 rounded-xl border border-market/40 bg-market/10 p-3 text-sm">
          <p>Send <strong>{o.total} birr</strong> by telebirr or bank transfer{o.payTo && <> to <strong>{o.payTo}</strong></>}, then type the transaction number here. We start once it arrives.</p>
          <div className="flex gap-2">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction number" aria-label="Transaction number" className="h-10 bg-background" />
            <Button type="button" disabled={ref.trim().length < 3 || saveRef.isPending} onClick={() => saveRef.mutate()}>Send</Button>
          </div>
        </div>
      )}

      {o.status === 'DRAFT_SENT' && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Your draft is ready. Open it below, then approve it or ask for changes{changesLeft > 0 ? ` (${changesLeft} left)` : ''}.</p>
          {changesLeft > 0 && <Textarea rows={2} value={changes} onChange={(e) => setChanges(e.target.value)} placeholder="What should we change?" aria-label="Changes" className="bg-background" />}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={respond.isPending} onClick={() => respond.mutate(true)}><Check /> Approve</Button>
            {changesLeft > 0 && <Button type="button" size="sm" variant="outline" disabled={respond.isPending || !changes.trim()} onClick={() => respond.mutate(false)}>Ask for changes</Button>}
          </div>
        </div>
      )}

      {o.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {o.files.map((x) => (
            <li key={x.id}>
              <Button type="button" size="sm" variant={x.kind === 'FINAL' ? 'default' : 'outline'} onClick={() => workApi.openCvFile(o.id, x.id).catch((e) => toast.error(errorText(e)))}>
                <FileText /> {x.kind === 'CUSTOMER' ? 'My file' : x.kind === 'DRAFT' ? 'Draft' : 'Final'}: {x.fileName}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && o.status !== 'DRAFT_SENT' && (
        <>
          <Button type="button" variant="ghost" size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Add my old CV or a certificate
          </Button>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.docx" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} />
        </>
      )}
    </div>
  )
}
