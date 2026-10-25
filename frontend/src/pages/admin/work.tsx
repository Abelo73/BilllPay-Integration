import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, Loader2, Phone, Star, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isAdmin } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { CV_PACK_LABEL, CV_STATUS_LABEL, JOB_TYPE_LABEL, salaryText, TALENT_STATUS_LABEL } from '@/lib/work-api'
import { workAdminApi, type AdminCvOrder, type AdminJob } from '@/lib/work-admin-api'
import { PageHeader, Pager, StatusBadge } from './shared'

const err = (e: Error) => toast.error(e.message)

/** Admin → Jobs: every post is checked before it goes live (J3). */
export function AdminJobsPage() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(0)
  const jobs = useQuery({ queryKey: ['admin-work-jobs', status, page], queryFn: () => workAdminApi.jobs(status, page), placeholderData: keepPreviousData })
  return (
    <div className="space-y-4">
      <PageHeader title="Job posts" description="Check each post: real employer, no fees asked from applicants, clear job. Paid posts go live once the fee arrives." />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
        <TabsList>
          {['PENDING', 'LIVE', 'REJECTED', 'CLOSED'].map((s) => <TabsTrigger key={s} value={s}>{s === 'PENDING' ? 'To check' : s[0] + s.slice(1).toLowerCase()}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {jobs.data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-3">{jobs.data?.content.map((j) => <JobRow key={j.job.id} row={j} />)}</div>
      {jobs.data && jobs.data.totalPages > 1 && <Pager page={page} totalPages={jobs.data.totalPages} onPage={setPage} total={jobs.data.totalElements} size={jobs.data.size} />}
    </div>
  )
}

function JobRow({ row }: { row: AdminJob }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const j = row.job
  const decide = useMutation({
    mutationFn: (body: Parameters<typeof workAdminApi.decideJob>[1]) => workAdminApi.decideJob(j.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-work-jobs'] })
      qc.invalidateQueries({ queryKey: ['admin-work-counts'] })
      toast.success('Saved')
    },
    onError: err,
  })
  const admin = isAdmin()
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="mr-auto min-w-0">
            <p className="font-semibold">{j.title} {j.featured && <Star className="inline size-4 fill-amber-400 text-amber-400" />}</p>
            <p className="text-sm text-muted-foreground">
              {j.employerName} · {j.place} · {JOB_TYPE_LABEL[j.type]} · {salaryText(j)} · apply by {j.deadline}
            </p>
            <p className="text-xs text-muted-foreground">
              Posted {formatDate(j.postedAt)}{row.employerPhone && <> · <Phone className="inline size-3" /> {row.employerPhone}</>} · fee {j.fee} birr {j.feePaid ? '(paid)' : '(not paid)'}
              {row.decidedBy && <> · {row.status.toLowerCase()} by {row.decidedBy}</>}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Read the post</summary>
          <p className="mt-2 whitespace-pre-line">{j.description}</p>
          {j.requirements && <p className="mt-2 whitespace-pre-line text-muted-foreground">{j.requirements}</p>}
        </details>
        {row.statusNote && <p className="text-sm text-destructive">Note: {row.statusNote}</p>}
        {admin && (
          <div className="flex flex-wrap items-center gap-2">
            {row.status === 'PENDING' && (
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ status: 'LIVE', markPaid: !j.feePaid || undefined })}>
                <Check /> {j.feePaid ? 'Approve' : 'Fee received, approve'}
              </Button>
            )}
            {row.status === 'LIVE' && (
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ featured: !j.featured })}>
                <Star /> {j.featured ? 'Stop featuring' : 'Feature (paid)'}
              </Button>
            )}
            {(row.status === 'PENDING' || row.status === 'LIVE') && (
              <>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (the employer sees it)" className="h-8 max-w-xs" aria-label="Reason" />
                <Button size="sm" variant="outline" disabled={!note.trim() || decide.isPending}
                  onClick={() => decide.mutate({ status: row.status === 'PENDING' ? 'REJECTED' : 'CLOSED', note })}>
                  <X /> {row.status === 'PENDING' ? 'Reject' : 'Take down'}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin → CV orders: the writing queue (J5). */
export function AdminCvOrdersPage() {
  const [show, setShow] = useState<'open' | 'unpaid' | 'done'>('open')
  const [page, setPage] = useState(0)
  const orders = useQuery({ queryKey: ['admin-work-cv', show, page], queryFn: () => workAdminApi.cvOrders(show, page), placeholderData: keepPreviousData })
  return (
    <div className="space-y-4">
      <PageHeader title="CV orders" description="Mark paid once the money arrives (the clock starts then), write, send the draft, then the final files." />
      <Tabs value={show} onValueChange={(v) => { setShow(v as typeof show); setPage(0) }}>
        <TabsList>
          <TabsTrigger value="open">To write</TabsTrigger>
          <TabsTrigger value="unpaid">Waiting for payment</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>
      </Tabs>
      {orders.data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-3">{orders.data?.content.map((o) => <CvRow key={o.order.id} row={o} />)}</div>
      {orders.data && orders.data.totalPages > 1 && <Pager page={page} totalPages={orders.data.totalPages} onPage={setPage} />}
    </div>
  )
}

function CvRow({ row }: { row: AdminCvOrder }) {
  const qc = useQueryClient()
  const o = row.order
  const [ref, setRef] = useState(o.paymentReference ?? '')
  const [showProfile, setShowProfile] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'DRAFT' | 'FINAL'>('DRAFT')
  const done = () => {
    qc.invalidateQueries({ queryKey: ['admin-work-cv'] })
    qc.invalidateQueries({ queryKey: ['admin-work-counts'] })
  }
  const act = useMutation({ mutationFn: (b: Parameters<typeof workAdminApi.cvAction>[1]) => workAdminApi.cvAction(o.id, b), onSuccess: () => { done(); toast.success('Saved') }, onError: err })
  const upload = useMutation({
    mutationFn: (file: File) => workAdminApi.cvUpload(o.id, kind, file),
    onSuccess: () => { done(); toast.success(kind === 'DRAFT' ? 'Draft sent. The customer got an SMS.' : 'Final sent and saved to their profile.') },
    onError: err,
  })
  const profile = useQuery({ queryKey: ['admin-work-profile', row.profileId], queryFn: () => workAdminApi.profile(row.profileId!), enabled: showProfile && !!row.profileId })
  const admin = isAdmin()
  const late = o.dueAt && new Date(o.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(o.status)

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="mr-auto">
            <p className="font-semibold">#{o.id} · {CV_PACK_LABEL[o.pack]}{o.express && ' · EXPRESS'} · {o.language} · {o.total} birr{o.discountPercent > 0 && ` (${o.discountPercent}% student)`}</p>
            <p className="text-sm text-muted-foreground">
              {row.customerName ?? 'No profile'}{row.customerPhone && ` · ${row.customerPhone}`} · ordered {formatDate(o.createdAt)}
              {o.dueAt && <span className={late ? 'font-semibold text-destructive' : ''}> · due {formatDate(o.dueAt)}{late && ' (late)'}</span>}
            </p>
            {o.targetJob && <p className="text-sm">Target job: {o.targetJob}</p>}
            {o.writer && <p className="text-xs text-muted-foreground">Writer: {o.writer} · changes {o.changesUsed}/{o.changesAllowed}</p>}
          </div>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-xs text-muted-foreground">{CV_STATUS_LABEL[o.status]}</p>
        {o.details && <p className="whitespace-pre-line rounded-md bg-muted p-2 text-sm">{o.details}</p>}
        {o.status === 'CHANGES' && o.changeRequest && <p className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-sm dark:bg-amber-950/30">Changes asked: {o.changeRequest}</p>}
        {o.files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {o.files.map((f) => (
              <Button key={f.id} size="sm" variant="outline" onClick={() => workAdminApi.openCvFile(o.id, f.id).catch(err)}><FileText /> {f.kind.toLowerCase()}: {f.fileName}</Button>
            ))}
          </div>
        )}
        {row.profileId && (
          <Button size="sm" variant="ghost" onClick={() => setShowProfile(!showProfile)}>{showProfile ? 'Hide' : 'Show'} their profile</Button>
        )}
        {showProfile && profile.data && (
          <div className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-2">
            <p><b>{profile.data.fullName}</b> · {TALENT_STATUS_LABEL[profile.data.status]}</p>
            <p>{[profile.data.fieldOfStudy, profile.data.school, profile.data.graduationYear].filter(Boolean).join(' · ')}</p>
            <p>Skills: {profile.data.skills.join(', ') || '—'}</p>
            <p>Languages: {profile.data.languages.join(', ') || '—'}</p>
            {profile.data.about && <p className="sm:col-span-2">{profile.data.about}</p>}
            {profile.data.experience.map((x, i) => <p key={i} className="sm:col-span-2">• {x.title}{x.place && ` at ${x.place}`} ({x.startMonth ?? '?'} – {x.endMonth ?? 'now'})</p>)}
          </div>
        )}
        {admin && (
          <div className="flex flex-wrap items-center gap-2">
            {o.status === 'AWAITING_PAYMENT' && (
              <>
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction number" className="h-8 max-w-[200px]" aria-label="Transaction number" />
                <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: 'paid', reference: ref })}><Check /> Money received</Button>
              </>
            )}
            {o.status === 'PAID' && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: 'writing' })}>Start writing</Button>}
            {['PAID', 'WRITING', 'CHANGES', 'DRAFT_SENT'].includes(o.status) && (
              <>
                <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => { setKind('DRAFT'); setTimeout(() => fileInput.current?.click()) }}><Upload /> Send draft</Button>
                <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => { setKind('FINAL'); setTimeout(() => fileInput.current?.click()) }}><Upload /> Send final</Button>
              </>
            )}
            {!['DONE', 'CANCELLED'].includes(o.status) && (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={act.isPending}
                onClick={() => { const note = window.prompt('Why cancel? (refund it yourself if they paid)'); if (note) act.mutate({ action: 'cancel', note }) }}>Cancel</Button>
            )}
            {upload.isPending && <Loader2 className="size-4 animate-spin" />}
            <input ref={fileInput} type="file" className="hidden" accept="application/pdf,.docx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin → Students: check student IDs for the verified badge (J7), and feature profiles (J6). */
export function AdminStudentsPage() {
  const [status, setStatus] = useState('SUBMITTED')
  const [page, setPage] = useState(0)
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin-work-students', status, page], queryFn: () => workAdminApi.students(status, page), placeholderData: keepPreviousData })
  const decide = useMutation({
    mutationFn: ({ id, approve, note }: { id: number; approve: boolean; note?: string }) => workAdminApi.decideStudent(id, approve, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-work-students'] })
      qc.invalidateQueries({ queryKey: ['admin-work-counts'] })
      toast.success('Saved')
    },
    onError: err,
  })
  const feature = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) => workAdminApi.featureTalent(id, days),
    onSuccess: (r) => toast.success(r.featuredUntil ? `Featured until ${formatDate(r.featuredUntil)}` : 'No longer featured'),
    onError: err,
  })
  const admin = isAdmin()
  return (
    <div className="space-y-4">
      <PageHeader title="Students" description="Check that the ID is a real, current student card and the name matches the profile. Approved students get the badge and the CV discount." />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
        <TabsList>
          <TabsTrigger value="SUBMITTED">To check</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-3">
        {list.data?.content.map((s) => (
          <Card key={s.profile.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="mr-auto">
                <p className="font-semibold">{s.profile.fullName}</p>
                <p className="text-sm text-muted-foreground">{[s.profile.fieldOfStudy, s.profile.school, s.profile.graduationYear].filter(Boolean).join(' · ') || 'No school given'}{s.profile.phone && ` · ${s.profile.phone}`}</p>
              </div>
              {s.idFileId && <Button size="sm" variant="outline" onClick={() => workAdminApi.openFile(s.idFileId!).catch(err)}><FileText /> Open ID</Button>}
              {admin && status === 'SUBMITTED' && (
                <>
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.profile.id, approve: true })}><Check /> Approve</Button>
                  <Button size="sm" variant="outline" disabled={decide.isPending}
                    onClick={() => { const note = window.prompt('Why not? (the student sees this)'); if (note) decide.mutate({ id: s.profile.id, approve: false, note }) }}><X /> Reject</Button>
                </>
              )}
              {admin && status === 'APPROVED' && (
                <Button size="sm" variant="outline" disabled={feature.isPending} onClick={() => feature.mutate({ id: s.profile.id, days: 7 })}><Star /> Feature 7 days (paid)</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {list.data && list.data.totalPages > 1 && <Pager page={page} totalPages={list.data.totalPages} onPage={setPage} />}
    </div>
  )
}
