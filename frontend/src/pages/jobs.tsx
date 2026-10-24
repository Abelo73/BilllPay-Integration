import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, Loader2, Phone, Star, Wrench } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Stars } from '@/components/reviews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { servicesApi, TRADE_LABEL, TRADES, type Job, type Timing, type Trade } from '@/lib/services-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'
import { NotFoundPage } from './not-found'
import { initials } from './chats'

const TIMING_LABEL: Record<Timing, string> = { TODAY: 'Today', TOMORROW: 'Tomorrow', THIS_WEEK: 'This week', DATE: 'Pick a day' }

const STATUS_TEXT: Record<Job['status'], string> = {
  OPEN: 'Waiting for quotes',
  ASSIGNED: 'Pro chosen',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

function useRequireSession(next: string) {
  const session = useSession((s) => s.session)
  return session ? null : <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
}

/** Describe a job (design S9). With ?pro=ID it goes to that pro only. */
export function NewJobPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const redirect = useRequireSession(`/jobs/new?${params}`)
  const proId = params.get('pro') ? Number(params.get('pro')) : null
  const [trade, setTrade] = useState<Trade>((params.get('trade') as Trade) || 'ELECTRICIAN')
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [timing, setTiming] = useState<Timing>('TODAY')
  const [date, setDate] = useState('')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [budget, setBudget] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const pro = useQuery({ queryKey: ['pro', proId], queryFn: () => servicesApi.pro(proId!), enabled: proId !== null })

  const post = useMutation({
    mutationFn: async () => {
      const job = await servicesApi.postJob({
        trade, description, area, timing, preferredDate: timing === 'DATE' ? date : null,
        budget: budget ? Number(budget) : null, proId,
      })
      for (const f of files) await servicesApi.addJobPhoto(job.id, f).catch(() => toast.warning('A photo could not be added'))
      return job
    },
    onSuccess: (job) => {
      toast.success(proId ? 'Sent to the pro' : 'Job posted. Pros will send you prices.')
      navigate(`/jobs/${job.id}`)
    },
    onError: (e) => toast.error(e.message),
  })
  if (redirect) return redirect

  return (
    <form
      className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        post.mutate()
      }}
    >
      <h1 className="text-2xl font-extrabold tracking-tight">Describe your job</h1>
      {proId && pro.data && (
        <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">This request goes only to <strong>{pro.data.card.displayName}</strong> ({TRADE_LABEL[pro.data.card.trade]}).</p>
      )}
      {!proId && (
        <div className="space-y-1.5">
          <Label htmlFor="trade">Type of work</Label>
          <select id="trade" value={trade} onChange={(e) => setTrade(e.target.value as Trade)} className="h-11 w-full rounded-xl border bg-card px-3">
            {TRADES.map((t) => <option key={t} value={t}>{TRADE_LABEL[t]}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="desc">What needs doing?</Label>
        <Textarea id="desc" rows={4} required minLength={10} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Two sockets in the kitchen stopped working and the light flickers." />
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Photos (optional, up to 3)</span>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <button key={i} type="button" className="size-20 overflow-hidden rounded-xl border" aria-label="Remove photo" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
              <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
            </button>
          ))}
          {files.length < 3 && (
            <button type="button" aria-label="Add photo" className="grid size-20 place-items-center rounded-xl border-2 border-dashed text-muted-foreground" onClick={() => fileRef.current?.click()}>
              <Camera />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles([...files, f]); e.target.value = '' }} />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">When?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(TIMING_LABEL) as Timing[]).map((t) => (
            <Button key={t} type="button" variant={timing === t ? 'default' : 'outline'} aria-pressed={timing === t} className="h-11" onClick={() => setTiming(t)}>{TIMING_LABEL[t]}</Button>
          ))}
        </div>
        {timing === 'DATE' && <Input type="date" required value={date} min={today} onChange={(e) => setDate(e.target.value)} className="h-11" aria-label="Date" />}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="area">Where?</Label>
        <Input id="area" required maxLength={200} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Near Wolaita Sodo University, gate 2" className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="budget">Your budget (optional)</Label>
        <Input id="budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} placeholder="ETB" className="h-11" />
      </div>
      <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">Asking is free. You see each pro’s price, rating and jobs done, then pick one. Phone numbers are shared only after you accept a price.</p>
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={post.isPending || description.trim().length < 10 || !area.trim()}>
        {post.isPending && <Loader2 className="animate-spin" />} {proId ? 'Send to this pro' : `Send to ${TRADE_LABEL[trade].toLowerCase()}s nearby`}
      </Button>
    </form>
  )
}

/** The customer's jobs. */
export function MyJobsPage() {
  const redirect = useRequireSession('/jobs')
  const { data } = useQuery({ queryKey: ['my-jobs'], queryFn: () => servicesApi.myJobs(), enabled: !redirect })
  if (redirect) return redirect
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">My jobs</h1>
        <Button asChild><Link to="/jobs/new"><Wrench /> New job</Link></Button>
      </div>
      {data?.content.length === 0 && <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No jobs yet. Need an electrician, tailor or plumber? Post a job and get prices.</p>}
      <ul className="space-y-2">
        {data?.content.map((j) => (
          <li key={j.id}>
            <Link to={`/jobs/${j.id}`} className="block space-y-1 rounded-2xl border bg-card p-4 hover:border-primary/40">
              <span className="flex justify-between gap-2"><strong>{TRADE_LABEL[j.trade]}</strong><span className="text-xs text-muted-foreground">{formatDate(j.createdAt)}</span></span>
              <span className="line-clamp-2 block text-sm text-muted-foreground">{j.description}</span>
              <span className="text-sm font-semibold text-brand">{STATUS_TEXT[j.status]}{j.status === 'OPEN' ? ` · ${j.quoteCount} quote${j.quoteCount === 1 ? '' : 's'}` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RateJob({ job }: { job: Job }) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const done = useMutation({
    mutationFn: () => servicesApi.done(job.id, rating, review),
    onSuccess: (j) => { qc.setQueryData(['job', job.id], j); toast.success('Thanks! The pro got your rating.') },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="space-y-3 rounded-2xl border border-warning/60 bg-amber-soft/40 p-4">
      <p className="font-bold">Is the work done? Rate the pro</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} stars`} className="grid size-11 place-items-center rounded-lg hover:bg-muted" onClick={() => setRating(i)}>
            <Star className={cn('size-7', i <= rating ? 'text-warning' : 'text-border')} fill="currentColor" strokeWidth={0} />
          </button>
        ))}
      </div>
      <Textarea rows={2} maxLength={1000} placeholder="How was it? (optional)" value={review} onChange={(e) => setReview(e.target.value)} aria-label="Review" />
      <Button disabled={!rating || done.isPending} onClick={() => done.mutate()}>{done.isPending && <Loader2 className="animate-spin" />} Mark done</Button>
    </div>
  )
}

function QuoteForm({ job }: { job: Job }) {
  const qc = useQueryClient()
  const [price, setPrice] = useState('')
  const [message, setMessage] = useState('')
  const [available, setAvailable] = useState('')
  const send = useMutation({
    mutationFn: () => servicesApi.quote(job.id, Number(price), message, available),
    onSuccess: (j) => { qc.setQueryData(['job', job.id], j); toast.success('Price sent') },
    onError: (e) => toast.error(e.message),
  })
  return (
    <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); send.mutate() }}>
      <p className="font-bold">Send your price</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="q-price">Price (ETB)</Label><Input id="q-price" required inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} className="h-11" /></div>
        <div className="space-y-1"><Label htmlFor="q-when">When can you come?</Label><Input id="q-when" maxLength={120} placeholder="Today 3 PM" value={available} onChange={(e) => setAvailable(e.target.value)} className="h-11" /></div>
      </div>
      <Textarea rows={2} maxLength={1000} placeholder="What's included?" value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message" />
      <Button type="submit" disabled={!price || send.isPending}>{send.isPending && <Loader2 className="animate-spin" />} Send price</Button>
    </form>
  )
}

/** One job (design S10): the customer compares quotes and accepts one; a pro sends a price. */
export function JobPage() {
  const { id } = useParams()
  const jobId = Number(id)
  const redirect = useRequireSession(`/jobs/${id}`)
  const qc = useQueryClient()
  const { data: job, error } = useQuery({ queryKey: ['job', jobId], queryFn: () => servicesApi.job(jobId), enabled: !redirect, refetchInterval: 15_000 })
  const set = (j: Job) => qc.setQueryData(['job', jobId], j)
  const accept = useMutation({ mutationFn: (quoteId: number) => servicesApi.accept(jobId, quoteId), onSuccess: (j) => { set(j); toast.success('Pro chosen. You can call them now.') }, onError: (e) => toast.error(e.message) })
  const cancel = useMutation({ mutationFn: () => servicesApi.cancel(jobId), onSuccess: set, onError: (e) => toast.error(e.message) })
  const withdraw = useMutation({ mutationFn: () => servicesApi.withdraw(jobId), onSuccess: set, onError: (e) => toast.error(e.message) })
  if (redirect) return redirect
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (!job) return <Loader2 className="mx-auto my-20 animate-spin text-muted-foreground" />
  const isCustomer = job.mine
  const proView = !job.mine

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold">{TRADE_LABEL[job.trade]}</h1>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">{STATUS_TEXT[job.status]}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm">{job.description}</p>
        <p className="text-xs text-muted-foreground">{job.area} · {TIMING_LABEL[job.timing]}{job.preferredDate ? ` ${job.preferredDate}` : ''}{job.budget ? ` · budget ${formatETB(job.budget)}` : ''} · by {job.customerName}</p>
        {job.photoUrls.length > 0 && <div className="flex gap-2">{job.photoUrls.map((u) => <img key={u} src={u} alt="Job" className="size-20 rounded-lg object-cover" />)}</div>}
        {job.customerPhone && (
          <a href={`tel:${job.customerPhone}`} className="flex items-center gap-2 rounded-xl bg-primary p-3 text-sm font-bold text-primary-foreground"><Phone className="size-4" /> Your price was accepted. Call {job.customerName}: {job.customerPhone}</a>
        )}
      </div>

      {proView && job.myQuote ? (
        <div className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
          <p className="font-bold">Your price: {formatETB(job.myQuote.price)}</p>
          <p className="text-muted-foreground">{job.myQuote.status === 'SENT' ? 'Waiting for the customer.' : `Status: ${job.myQuote.status.toLowerCase()}`}</p>
          {job.myQuote.status === 'SENT' && <Button size="sm" variant="outline" onClick={() => withdraw.mutate()}>Withdraw</Button>}
        </div>
      ) : proView && !isCustomer && job.status === 'OPEN' ? (
        <QuoteForm job={job} />
      ) : null}

      {isCustomer && (
        <section className="space-y-3" aria-labelledby="quotes">
          <h2 id="quotes" className="font-bold">{job.quotes.length} quote{job.quotes.length === 1 ? '' : 's'}</h2>
          {job.quotes.length === 0 && job.status === 'OPEN' && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Pros are looking at your job. We’ll text you when a price comes in.</p>}
          {job.quotes.map((q) => (
            <article key={q.id} className={cn('space-y-2 rounded-2xl border bg-card p-4', q.status === 'ACCEPTED' && 'border-2 border-primary')}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-accent font-bold text-accent-foreground">{initials(q.pro.displayName)}</span>
                <Link to={`/pros/${q.pro.id}`} className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-bold">{q.pro.displayName} <BadgeCheck className="size-4 text-primary" /></span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">{q.pro.rating !== null ? <><Stars value={q.pro.rating} /> {q.pro.rating.toFixed(1)} ·</> : 'New ·'} {q.pro.jobsDone} jobs</span>
                </Link>
                <span className="text-lg font-extrabold tabular-nums">{formatETB(q.price)}</span>
              </div>
              {q.message && <p className="text-sm">{q.message}</p>}
              {q.available && <p className="text-xs text-muted-foreground">Available: {q.available}</p>}
              {q.proPhone && <a href={`tel:${q.proPhone}`} className="flex items-center gap-2 rounded-xl bg-primary p-3 text-sm font-bold text-primary-foreground"><Phone className="size-4" /> Call {q.pro.displayName}: {q.proPhone}</a>}
              {job.status === 'OPEN' && q.status === 'SENT' && (
                <Button className="h-11 w-full" disabled={accept.isPending} onClick={() => accept.mutate(q.id)}>Accept this price</Button>
              )}
              {q.status !== 'SENT' && q.status !== 'ACCEPTED' && <p className="text-xs text-muted-foreground">{q.status.toLowerCase()}</p>}
            </article>
          ))}
          {job.status === 'ASSIGNED' && <RateJob job={job} />}
          {job.status === 'DONE' && job.rating && <p className="rounded-xl bg-success/10 p-3 text-sm">You rated this job {job.rating}/5. Thank you!</p>}
          {(job.status === 'OPEN' || job.status === 'ASSIGNED') && (
            <button type="button" className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:text-destructive hover:underline" onClick={() => cancel.mutate()}>Cancel this job</button>
          )}
        </section>
      )}
    </div>
  )
}
