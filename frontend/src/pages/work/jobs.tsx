import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BriefcaseBusiness, CalendarClock, Check, FileText, Loader2, MapPin, Search, Star, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import { JOB_TYPE_LABEL, salaryText, workApi, type JobType, type JobView } from '@/lib/work-api'
import { useSession } from '@/store/session'
import { daysLeft, errorText, Notice, shortDate, WorkNav } from './shared'

/** /work: jobs in and around Sodo, featured first. */
export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const f = useFeatures()
  const q = params.get('q') ?? ''
  const type = (params.get('type') ?? '') as JobType | ''
  const page = Number(params.get('page') ?? 0)
  const [text, setText] = useState(q)
  const jobs = useQuery({ queryKey: ['work-jobs', q, type, page], queryFn: () => workApi.jobs({ q, type, page }), enabled: f.on('job_posts') })
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    n.delete('page')
    setParams(n)
  }

  if (f.loaded && !f.on('job_posts')) {
    return (
      <>
        <WorkNav />
        <Notice title="The jobs board is coming soon">Make your free profile and CV now, so you're ready.</Notice>
      </>
    )
  }

  return (
    <>
      <WorkNav />
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="drift-slow pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-market/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl space-y-5 px-4 py-10 sm:px-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-market">Jobs in Wolaita Sodo</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Find work near you. Apply in one tap.</h1>
            <p className="max-w-2xl text-primary-foreground/80">Every job is checked by our team. Never pay anyone to apply.</p>
          </div>
          <form
            className="flex max-w-2xl gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              set('q', text.trim())
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Accountant, nurse, driver…" aria-label="Search jobs"
                className="h-12 rounded-full bg-background pl-9 text-foreground" />
            </div>
            <Button type="submit" size="lg" className="h-12 rounded-full bg-market px-6 text-[#13201A] hover:bg-market/90">Search</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {(['', ...Object.keys(JOB_TYPE_LABEL)] as (JobType | '')[]).map((t) => (
              <button key={t || 'all'} type="button" onClick={() => set('type', t)} aria-pressed={type === t}
                className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors',
                  type === t ? 'border-market bg-market text-[#13201A]' : 'border-primary-foreground/30 hover:bg-primary-foreground/10')}>
                {t ? JOB_TYPE_LABEL[t] : 'All jobs'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {jobs.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          {jobs.data && jobs.data.content.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              No jobs match yet. New jobs arrive every week. Make your profile so you're ready.
            </div>
          )}
          {jobs.data?.content.map((j) => <JobCard key={j.id} job={j} />)}
          {jobs.data && jobs.data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" disabled={page === 0} onClick={() => setParams({ ...Object.fromEntries(params), page: String(page - 1) })}>Previous</Button>
              <Button variant="outline" disabled={page + 1 >= jobs.data.totalPages} onClick={() => setParams({ ...Object.fromEntries(params), page: String(page + 1) })}>Next</Button>
            </div>
          )}
        </div>
        <aside className="space-y-3">
          <SideCard title="Your free profile" text="One profile, one tap to apply. Employers see your skills and your CV." to="/work/profile" cta="Make my profile" />
          {f.on('cv_service') && (
            <SideCard title="Need a strong CV?" text={`Our team writes it for you, from ${f.number('cv_basic_price')} birr.`} to="/work/cv" cta="See CV packages" amber />
          )}
          <SideCard title="Hiring?" text={f.on('free_first_post') ? 'Post your first job free. We check it and it goes live.' : 'Post a job and get applications with CVs.'}
            to="/work/post" cta="Post a job" />
        </aside>
      </div>
    </>
  )
}

function SideCard({ title, text, to, cta, amber }: { title: string; text: string; to: string; cta: string; amber?: boolean }) {
  return (
    <div className={cn('space-y-2 rounded-2xl border p-4', amber && 'border-market/40 bg-market/10')}>
      <p className="font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button asChild size="sm" variant={amber ? 'default' : 'outline'} className={cn('rounded-full', amber && 'bg-market text-[#13201A] hover:bg-market/90')}>
        <Link to={to}>{cta}</Link>
      </Button>
    </div>
  )
}

function JobCard({ job }: { job: JobView }) {
  return (
    <Link to={`/work/jobs/${job.id}`}
      className={cn('group block rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5', job.featured && 'border-market/60 ring-1 ring-market/30')}>
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BriefcaseBusiness className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold group-hover:text-primary">{job.title}</h2>
            {job.featured && <span className="inline-flex items-center gap-1 rounded-full bg-market/15 px-2 py-0.5 text-xs font-semibold text-market-deep"><Star className="size-3" /> Featured</span>}
            {job.applied && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"><Check className="size-3" /> Applied</span>}
          </div>
          <p className="text-sm text-muted-foreground">{job.employerName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{job.place}</span>
            <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="size-3.5" />{JOB_TYPE_LABEL[job.type]}</span>
            <span className="inline-flex items-center gap-1"><Wallet className="size-3.5" />{salaryText(job)}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{daysLeft(job.deadline)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

/** /work/jobs/:id with one-tap apply. */
export function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const session = useSession((s) => s.session)
  const job = useQuery({ queryKey: ['work-job', id], queryFn: () => workApi.job(Number(id)), retry: false })
  const [applying, setApplying] = useState(false)

  if (job.isLoading) return <><WorkNav /><div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-80 rounded-2xl" /></div></>
  if (!job.data) return <><WorkNav /><Notice title="This job isn't open">It may have closed or been filled. <Link to="/work" className="text-primary underline">See other jobs</Link>.</Notice></>
  const j = job.data
  const mine = j.status !== null

  return (
    <>
      <WorkNav />
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2"><ArrowLeft /> Back</Button>
        <header className="space-y-3 rounded-3xl border bg-card p-5 sm:p-7">
          {j.featured && <span className="inline-flex items-center gap-1 rounded-full bg-market/15 px-2 py-0.5 text-xs font-semibold text-market-deep"><Star className="size-3" /> Featured</span>}
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{j.title}</h1>
          <p className="text-lg text-muted-foreground">{j.employerName}</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <Fact icon={MapPin} text={j.place} />
            <Fact icon={BriefcaseBusiness} text={JOB_TYPE_LABEL[j.type] + (j.field ? ` · ${j.field}` : '')} />
            <Fact icon={Wallet} text={salaryText(j)} />
            <Fact icon={CalendarClock} text={`Apply by ${shortDate(j.deadline)} (${daysLeft(j.deadline)})`} />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {mine ? (
              <Button asChild className="rounded-full"><Link to="/work/employer">Manage this job</Link></Button>
            ) : j.applied ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 font-semibold text-primary"><Check className="size-4" /> You applied</span>
            ) : (
              <Button size="lg" className="rounded-full px-8" onClick={() => (session ? setApplying(true) : navigate(`/login?next=/work/jobs/${j.id}`))}>
                Apply in one tap
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Posted {shortDate(j.postedAt)}</span>
          </div>
        </header>
        <section className="space-y-2">
          <h2 className="text-lg font-bold">About the job</h2>
          <p className="whitespace-pre-line text-muted-foreground">{j.description}</p>
        </section>
        {j.requirements && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold">What they're looking for</h2>
            <p className="whitespace-pre-line text-muted-foreground">{j.requirements}</p>
          </section>
        )}
        <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Safety:</strong> real employers never ask you to pay to apply, for training, or for a uniform. If anyone does, report it to us.
        </p>
      </article>
      {applying && <ApplyDialog job={j} onClose={() => setApplying(false)} />}
    </>
  )
}

function Fact({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return <span className="inline-flex items-center gap-2 text-muted-foreground"><Icon className="size-4 text-primary" />{text}</span>
}

function ApplyDialog({ job, onClose }: { job: JobView; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const profile = useQuery({ queryKey: ['work-profile'], queryFn: workApi.profile, retry: false })
  const cvs = (profile.data?.files ?? []).filter((x) => x.kind === 'CV_UPLOAD' || x.kind === 'CV_PRO')
  const [choice, setChoice] = useState<'AUTO' | number>('AUTO')
  const [message, setMessage] = useState('')
  const apply = useMutation({
    mutationFn: () => workApi.apply(job.id, { cvKind: choice === 'AUTO' ? 'AUTO' : 'FILE', cvFileId: choice === 'AUTO' ? null : choice, message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success('Sent! The employer can now see your profile and phone number.')
      qc.invalidateQueries({ queryKey: ['work-job'] })
      qc.invalidateQueries({ queryKey: ['work-jobs'] })
      qc.invalidateQueries({ queryKey: ['work-applications'] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const noProfile = profile.error instanceof ApiError && profile.error.code === 'NO_PROFILE'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for {job.title}</DialogTitle>
          <DialogDescription>{job.employerName} sees your profile, your CV and your phone number.</DialogDescription>
        </DialogHeader>
        {profile.isLoading && <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}
        {noProfile && (
          <div className="space-y-3">
            <p className="text-sm">Make your free profile first. It takes 3 minutes and you use it for every job.</p>
            <Button className="w-full" onClick={() => navigate(`/work/profile?next=/work/jobs/${job.id}`)}>Make my profile</Button>
          </div>
        )}
        {profile.data && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Which CV?</legend>
              <CvChoice active={choice === 'AUTO'} onClick={() => setChoice('AUTO')} title="My Sodo Gebeya CV" note="Made from your profile" />
              {cvs.map((c) => (
                <CvChoice key={c.id} active={choice === c.id} onClick={() => setChoice(c.id)} title={c.fileName} note={c.kind === 'CV_PRO' ? 'Professional CV' : 'Uploaded PDF'} />
              ))}
            </fieldset>
            <Textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short note to the employer (optional)" aria-label="Message" />
          </div>
        )}
        {profile.data && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>{apply.isPending && <Loader2 className="animate-spin" />}Send application</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CvChoice({ active, onClick, title, note }: { active: boolean; onClick: () => void; title: string; note: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors', active ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
      <FileText className={cn('size-5', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{note}</span>
      </span>
      {active && <Check className="size-4 text-primary" />}
    </button>
  )
}
