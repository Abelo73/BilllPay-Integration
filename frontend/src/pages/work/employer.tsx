import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, Inbox, Loader2, Phone, Plus, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import {
  APP_STATUS_LABEL, JOB_TYPE_LABEL, TALENT_STATUS_LABEL, workApi,
  type Application, type AppStatus, type JobInput, type JobType, type JobView, type Profile,
} from '@/lib/work-api'
import { daysLeft, errorText, Notice, shortDate, StudentBadge, useRequireSession, WorkNav } from './shared'

const STATUS_STYLE: Record<AppStatus, string> = {
  NEW: 'bg-muted text-foreground',
  SHORTLISTED: 'bg-primary/10 text-primary',
  INTERVIEW: 'bg-market/20 text-market-deep',
  HIRED: 'bg-primary text-primary-foreground',
  NOT_SELECTED: 'bg-muted text-muted-foreground',
}

export function AppStatusPill({ status }: { status: AppStatus }) {
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[status])}>{APP_STATUS_LABEL[status]}</span>
}

/** /work/applications: what I applied to, and where each one stands (J4). */
export function MyApplicationsPage() {
  const redirect = useRequireSession('/work/applications')
  const apps = useQuery({ queryKey: ['work-applications'], queryFn: workApi.myApplications, enabled: !redirect })
  if (redirect) return redirect
  return (
    <>
      <WorkNav />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight">My applications</h1>
        <p className="text-sm text-muted-foreground">We send you an SMS when an employer wants to interview you.</p>
        {apps.isLoading && <Skeleton className="h-24 rounded-2xl" />}
        {apps.data?.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            You haven't applied yet. <Link to="/work" className="font-semibold text-primary underline">See jobs</Link>
          </div>
        )}
        <ul className="space-y-2">
          {apps.data?.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                {a.job ? <Link to={`/work/jobs/${a.job.id}`} className="font-bold hover:text-primary">{a.job.title}</Link> : <span className="font-bold">Job removed</span>}
                <p className="text-sm text-muted-foreground">{a.job?.employerName} · applied {shortDate(a.createdAt)}</p>
              </div>
              <AppStatusPill status={a.status} />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

const JOB_STATUS: Record<NonNullable<JobView['status']>, [string, string]> = {
  PENDING: ['Checking', 'bg-market/20 text-market-deep'],
  LIVE: ['Live', 'bg-primary text-primary-foreground'],
  REJECTED: ['Not approved', 'bg-destructive/10 text-destructive'],
  CLOSED: ['Closed', 'bg-muted text-muted-foreground'],
}

/** /work/employer: my job posts and their applications, and talent search (J3, J6). */
export function EmployerPage() {
  const redirect = useRequireSession('/work/employer')
  const [params, setParams] = useSearchParams()
  const jobs = useQuery({ queryKey: ['work-my-jobs'], queryFn: workApi.myJobs, enabled: !redirect })
  const open = params.get('job') ? Number(params.get('job')) : null
  const tab = params.get('tab') === 'talent' ? 'talent' : 'jobs'
  if (redirect) return redirect
  const job = jobs.data?.find((j) => j.id === open)

  return (
    <>
      <WorkNav />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-extrabold tracking-tight">Hiring</h1>
          <Button asChild className="rounded-full"><Link to="/work/post"><Plus /> Post a job</Link></Button>
        </div>
        {!!jobs.data?.length && (
          <div className="inline-flex rounded-full border p-0.5">
            {(['jobs', 'talent'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setParams(t === 'talent' ? { tab: t } : {})}
                className={cn('rounded-full px-4 py-1.5 text-sm', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                {t === 'jobs' ? 'My jobs' : 'Find people'}
              </button>
            ))}
          </div>
        )}
        {tab === 'talent' ? (
          <TalentSearch />
        ) : job ? (
          <JobInbox job={job} onBack={() => setParams({})} />
        ) : (
          <>
            {jobs.isLoading && <Skeleton className="h-24 rounded-2xl" />}
            {jobs.data?.length === 0 && (
              <div className="space-y-3 rounded-3xl border border-dashed p-10 text-center">
                <Users className="mx-auto size-10 text-primary" />
                <p className="text-lg font-bold">Find good people in Sodo</p>
                <p className="text-muted-foreground">Post a job. We check it, it goes live, and applications arrive here with CVs and phone numbers.</p>
                <Button asChild className="rounded-full"><Link to="/work/post">Post a job</Link></Button>
              </div>
            )}
            <ul className="space-y-2">
              {jobs.data?.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => setParams({ job: String(j.id) })} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{j.title}</p>
                      <p className="text-sm text-muted-foreground">{j.place} · {JOB_TYPE_LABEL[j.type]} · {j.status === 'LIVE' ? daysLeft(j.deadline) : `posted ${shortDate(j.postedAt)}`}</p>
                      {j.status === 'PENDING' && !j.feePaid && <p className="mt-1 text-sm text-market-deep">Fee {j.fee} birr not received yet. See how to pay below.</p>}
                      {j.status === 'REJECTED' && j.statusNote && <p className="mt-1 text-sm text-destructive">{j.statusNote}</p>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Inbox className="size-4" />{j.applications}</span>
                    {j.status && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', JOB_STATUS[j.status][1])}>{JOB_STATUS[j.status][0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {jobs.data?.some((j) => j.status === 'PENDING' && !j.feePaid) && <PayFee />}
          </>
        )}
      </div>
    </>
  )
}

function PayFee() {
  const f = useFeatures()
  const phone = f.text('support_phone')
  return (
    <div className="rounded-2xl border border-market/40 bg-market/10 p-4 text-sm">
      <p className="font-bold">How to pay the job post fee</p>
      <p className="text-muted-foreground">
        Send the fee by telebirr or bank transfer{phone ? <> to <strong className="text-foreground">{phone}</strong></> : ''}, then call or message us with the job title.
        We mark it paid and your job goes live after our check.
      </p>
    </div>
  )
}

function JobInbox({ job, onBack }: { job: JobView; onBack: () => void }) {
  const qc = useQueryClient()
  const apps = useQuery({ queryKey: ['work-job-apps', job.id], queryFn: () => workApi.jobApplications(job.id) })
  const [openId, setOpenId] = useState<number | null>(null)
  const status = useMutation({
    mutationFn: ({ id, s }: { id: number; s: AppStatus }) => workApi.setStatus(id, s),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-job-apps', job.id] })
      if (v.s === 'INTERVIEW' || v.s === 'HIRED') toast.success('Done. We sent them an SMS.')
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const close = useMutation({
    mutationFn: () => workApi.closeJob(job.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-my-jobs'] })
      toast.success('Job closed')
    },
  })

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ArrowLeft /> My jobs</Button>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-extrabold">{job.title}</h2>
          <p className="text-sm text-muted-foreground">{job.applications} {job.applications === 1 ? 'application' : 'applications'} · {job.status === 'LIVE' ? daysLeft(job.deadline) : job.status && JOB_STATUS[job.status][0]}</p>
        </div>
        {job.status === 'LIVE' && <Button asChild variant="outline" size="sm"><Link to={`/work/jobs/${job.id}`}>See the post</Link></Button>}
        {(job.status === 'LIVE' || job.status === 'PENDING') && <Button variant="outline" size="sm" disabled={close.isPending} onClick={() => close.mutate()}>Close job</Button>}
      </div>
      {apps.isLoading && <Skeleton className="h-24 rounded-2xl" />}
      {apps.data?.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">No applications yet.</p>}
      <ul className="space-y-2">
        {apps.data?.map((a) => (
          <li key={a.id} className="rounded-2xl border bg-card">
            <button type="button" className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setOpenId(openId === a.id ? null : a.id)} aria-expanded={openId === a.id}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">{a.applicant?.fullName}{a.applicant?.verifiedStudent && <StudentBadge />}</p>
                <p className="text-sm text-muted-foreground">{a.applicant?.headline || (a.applicant && TALENT_STATUS_LABEL[a.applicant.status])} · {shortDate(a.createdAt)}</p>
              </div>
              <AppStatusPill status={a.status} />
            </button>
            {openId === a.id && a.applicant && (
              <div className="space-y-3 border-t p-4">
                <ApplicantDetail a={a} p={a.applicant} />
                <div className="flex flex-wrap gap-2">
                  {(['SHORTLISTED', 'INTERVIEW', 'HIRED', 'NOT_SELECTED'] as AppStatus[]).map((s) => (
                    <Button key={s} size="sm" variant={a.status === s ? 'default' : 'outline'} disabled={status.isPending || a.status === s}
                      onClick={() => status.mutate({ id: a.id, s })}>{APP_STATUS_LABEL[s]}</Button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApplicantDetail({ a, p }: { a: Application; p: Profile }) {
  return (
    <div className="space-y-3 text-sm">
      {a.message && <p className="rounded-xl bg-muted p-3">“{a.message}”</p>}
      <div className="flex flex-wrap gap-2">
        {p.phone && <Button asChild size="sm"><a href={`tel:${p.phone}`}><Phone /> {p.phone}</a></Button>}
        {a.cvKind === 'FILE' ? (
          <Button size="sm" variant="outline" onClick={() => workApi.openApplicationCv(a.id).catch((e) => toast.error(errorText(e)))}><FileText /> Open their CV</Button>
        ) : (
          <Button asChild size="sm" variant="outline"><Link to={`/work/people/${p.id}`}><FileText /> See their profile</Link></Button>
        )}
      </div>
      <ProfileFacts p={p} />
    </div>
  )
}

function ProfileFacts({ p }: { p: Profile }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {(p.school || p.fieldOfStudy) && <Fact k="Education" v={[p.fieldOfStudy, p.school, p.graduationYear].filter(Boolean).join(' · ')} />}
      {p.skills.length > 0 && <Fact k="Skills" v={p.skills.join(', ')} />}
      {p.languages.length > 0 && <Fact k="Languages" v={p.languages.join(', ')} />}
      {p.experience.length > 0 && <Fact k="Experience" v={p.experience.map((x) => x.title + (x.place ? ` (${x.place})` : '')).join('; ')} />}
    </dl>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function TalentSearch() {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const people = useQuery({ queryKey: ['work-talent', term], queryFn: () => workApi.talent({ q: term }), retry: false })
  return (
    <div className="space-y-4">
      <form className="flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Skill or field, e.g. accounting" className="h-11 pl-9" aria-label="Search people" />
        </div>
        <Button type="submit" className="h-11">Search</Button>
      </form>
      <p className="text-sm text-muted-foreground">People who chose to be found. Their phone number shows once they apply to one of your jobs.</p>
      {people.error instanceof ApiError && <p className="text-sm text-destructive">{people.error.message}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {people.data?.content.map((p) => (
          <Link key={p.id} to={`/work/people/${p.id}`} className="space-y-1 rounded-2xl border bg-card p-4 hover:shadow-md">
            <p className="flex flex-wrap items-center gap-2 font-bold">{p.fullName}{p.verifiedStudent && <StudentBadge />}</p>
            <p className="text-sm text-muted-foreground">{p.headline || TALENT_STATUS_LABEL[p.status]}</p>
            {p.skills.length > 0 && <p className="line-clamp-1 text-sm">{p.skills.join(' · ')}</p>}
          </Link>
        ))}
      </div>
      {people.data?.content.length === 0 && <p className="text-muted-foreground">No one matches yet.</p>}
    </div>
  )
}

/** /work/people/:id: a person's profile for an employer. */
export function PersonPage() {
  const params = useParams()
  const id = Number(params.id)
  const redirect = useRequireSession(`/work/people/${id}`)
  const navigate = useNavigate()
  const p = useQuery({ queryKey: ['work-person', id], queryFn: () => workApi.profileById(id), retry: false, enabled: !redirect })
  if (redirect) return redirect
  if (p.isLoading) return <><WorkNav /><div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-60 rounded-2xl" /></div></>
  if (!p.data) return <><WorkNav /><Notice title="Profile not available" /></>
  const x = p.data
  return (
    <>
      <WorkNav />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
        <header className="space-y-2 rounded-3xl border bg-card p-6">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">{x.fullName}{x.verifiedStudent && <StudentBadge />}</h1>
          <p className="text-muted-foreground">{x.headline || TALENT_STATUS_LABEL[x.status]}</p>
          {x.phone && <Button asChild size="sm"><a href={`tel:${x.phone}`}><Phone /> {x.phone}</a></Button>}
        </header>
        {x.about && <p className="whitespace-pre-line">{x.about}</p>}
        <ProfileFacts p={x} />
        {x.experience.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">Experience</h2>
            <ul className="space-y-2">
              {x.experience.map((e, i) => (
                <li key={i} className="rounded-xl border p-3">
                  <p className="font-semibold">{e.title}{e.place && <span className="font-normal text-muted-foreground"> · {e.place}</span>}</p>
                  {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

/** /work/post: post a job; staff check it before it goes live (J3). */
export function PostJobPage() {
  const redirect = useRequireSession('/work/post')
  const f = useFeatures()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const mine = useQuery({ queryKey: ['work-my-jobs'], queryFn: workApi.myJobs, enabled: !redirect })
  const [form, setForm] = useState<JobInput>({ employerName: '', title: '', place: 'Wolaita Sodo', type: 'FULL_TIME', field: '', description: '', requirements: '', salaryNote: '', deadline: inDays(14) })
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const post = useMutation({
    mutationFn: () => workApi.postJob({ ...form, salaryMin: min ? Number(min) : null, salaryMax: max ? Number(max) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-my-jobs'] })
      toast.success('Sent! We check every job, usually within a few hours.')
      navigate('/work/employer')
    },
    onError: (e) => toast.error(errorText(e)),
  })
  if (redirect) return redirect
  if (f.loaded && !f.on('job_posts')) return <><WorkNav /><Notice title="Job posts are coming soon" /></>
  const free = f.on('free_first_post') && mine.data?.length === 0
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => setForm({ ...form, [k]: v })

  return (
    <>
      <WorkNav />
      <form className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6" onSubmit={(e) => { e.preventDefault(); post.mutate() }}>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Post a job</h1>
          <p className="text-muted-foreground">
            {free ? <>Your first job post is <strong className="text-primary">free</strong>.</> : <>A job post costs <strong>{f.number('job_post_price')} birr</strong>, paid by telebirr or bank after you send it.</>}
            {' '}Our team checks it before it goes live.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Job title" id="title"><Input id="title" required maxLength={140} value={form.title} onChange={(e) => set('title', e.target.value)} className="h-11" placeholder="Accountant" /></F>
          <F label="Employer name" id="emp"><Input id="emp" required maxLength={120} value={form.employerName} onChange={(e) => set('employerName', e.target.value)} className="h-11" placeholder="Your business" /></F>
          <F label="Place" id="place"><Input id="place" required maxLength={120} value={form.place} onChange={(e) => set('place', e.target.value)} className="h-11" /></F>
          <F label="Field (optional)" id="field"><Input id="field" maxLength={80} value={form.field} onChange={(e) => set('field', e.target.value)} className="h-11" placeholder="Health, finance, sales…" /></F>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((t) => (
              <Button key={t} type="button" variant={form.type === t ? 'default' : 'outline'} aria-pressed={form.type === t} className="h-11" onClick={() => set('type', t)}>{JOB_TYPE_LABEL[t]}</Button>
            ))}
          </div>
        </fieldset>
        <F label="What the job is" id="desc">
          <Textarea id="desc" required rows={5} maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Daily tasks, hours, who they work with." />
        </F>
        <F label="Who you're looking for (optional)" id="req">
          <Textarea id="req" rows={3} maxLength={2000} value={form.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder="Education, experience, languages." />
        </F>
        <div className="grid gap-4 sm:grid-cols-3">
          <F label="Salary from (birr)" id="min"><Input id="min" type="number" min={0} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="h-11" /></F>
          <F label="Salary to (birr)" id="max"><Input id="max" type="number" min={0} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} className="h-11" /></F>
          <F label="Apply by" id="deadline"><Input id="deadline" type="date" required min={today()} max={inDays(90)} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} className="h-11" /></F>
        </div>
        <F label="Salary note (optional)" id="snote"><Input id="snote" maxLength={80} value={form.salaryNote} onChange={(e) => set('salaryNote', e.target.value)} className="h-11" placeholder="Monthly, plus lunch" /></F>
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Posts that ask applicants to pay anything (fees, deposits, training) are not allowed.</p>
        <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto sm:px-10" disabled={post.isPending}>{post.isPending && <Loader2 className="animate-spin" />}Send for checking</Button>
      </form>
    </>
  )
}

function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>
}
