import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, GraduationCap, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import {
  JOB_TYPE_LABEL, TALENT_STATUS_LABEL, WORK_PLACE_LABEL, WORK_PLACES, WORK_TYPES, workApi,
  type Experience, type FileKind, type Profile, type ProfileInput, type TalentStatus,
} from '@/lib/work-api'
import { errorText, Notice, shortDate, StudentBadge, useRequireSession, WorkNav } from './shared'

const WORK_TYPE_LABEL: Record<string, string> = { ...JOB_TYPE_LABEL, WEEKEND: 'Weekends' }

const empty: ProfileInput = {
  fullName: '', status: 'GRADUATE', headline: '', about: '', school: '', fieldOfStudy: '', graduationYear: null,
  skills: [], languages: ['Amharic'], workTypes: [], workPlaces: ['SODO'], publicProfile: false, experience: [],
}

const toInput = (p: Profile): ProfileInput => ({
  fullName: p.fullName === 'Deleted profile' ? '' : p.fullName, status: p.status, headline: p.headline ?? '', about: p.about ?? '', school: p.school ?? '',
  fieldOfStudy: p.fieldOfStudy ?? '', graduationYear: p.graduationYear, skills: p.skills, languages: p.languages,
  workTypes: p.workTypes, workPlaces: p.workPlaces, publicProfile: p.publicProfile, experience: p.experience,
})

/** /work/profile: one profile for every job (J1), with CVs and certificates, and the student ID (J7). */
export function ProfilePage() {
  const redirect = useRequireSession('/work/profile')
  const f = useFeatures()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['work-profile'], queryFn: workApi.profile, retry: false, enabled: !redirect })
  const missing = profile.error instanceof ApiError && profile.error.code === 'NO_PROFILE'
  const [form, setForm] = useState<ProfileInput | null>(null)

  useEffect(() => {
    if (form) return
    if (profile.data) setForm(toInput(profile.data))
    else if (missing) setForm({ ...empty, publicProfile: f.on('profile_public_default') })
  }, [profile.data, missing, form, f])

  const save = useMutation({
    mutationFn: (input: ProfileInput) => workApi.saveProfile(input),
    onSuccess: (p) => {
      qc.setQueryData(['work-profile'], p)
      toast.success('Profile saved')
      const next = params.get('next')
      if (next?.startsWith('/work')) navigate(next)
    },
    onError: (e) => toast.error(errorText(e)),
  })

  if (redirect) return redirect
  if (f.loaded && !f.on('talent_profiles')) return <><WorkNav /><Notice title="Profiles are coming soon" /></>
  if (!form) return <><WorkNav /><div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></>

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setForm({ ...form, [k]: v })
  const toggle = (k: 'workTypes' | 'workPlaces', v: string) =>
    set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v])

  return (
    <>
      <WorkNav />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(form)
          }}
        >
          <div className="space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight">
              {missing && !profile.data ? 'Make your free profile' : 'My profile'}
              {profile.data?.verifiedStudent && <StudentBadge />}
            </h1>
            <p className="text-muted-foreground">Fill it once. Apply to any job in one tap, and get a free CV made from it.</p>
          </div>

          <Section title="About you">
            <Field label="Full name" id="name">
              <Input id="name" required maxLength={120} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className="h-11" />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Right now I am</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(TALENT_STATUS_LABEL) as TalentStatus[]).map((s) => (
                  <Button key={s} type="button" variant={form.status === s ? 'default' : 'outline'} aria-pressed={form.status === s}
                    className="h-auto min-h-11 whitespace-normal py-2" onClick={() => set('status', s)}>{TALENT_STATUS_LABEL[s]}</Button>
                ))}
              </div>
            </fieldset>
            <Field label="Headline" id="headline" hint="One line employers see first, e.g. “Accountant, 2 years experience”">
              <Input id="headline" maxLength={160} value={form.headline} onChange={(e) => set('headline', e.target.value)} className="h-11" />
            </Field>
            <Field label="About me" id="about">
              <Textarea id="about" rows={4} maxLength={1500} value={form.about} onChange={(e) => set('about', e.target.value)}
                placeholder="What you're good at and the work you want." />
            </Field>
          </Section>

          <Section title="Education">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School or university" id="school">
                <Input id="school" maxLength={160} value={form.school} onChange={(e) => set('school', e.target.value)} className="h-11" placeholder="Wolaita Sodo University" />
              </Field>
              <Field label="Field of study" id="field">
                <Input id="field" maxLength={160} value={form.fieldOfStudy} onChange={(e) => set('fieldOfStudy', e.target.value)} className="h-11" />
              </Field>
              <Field label="Graduation year" id="year">
                <Input id="year" type="number" inputMode="numeric" min={1970} max={new Date().getFullYear() + 8} value={form.graduationYear ?? ''}
                  onChange={(e) => set('graduationYear', e.target.value ? Number(e.target.value) : null)} className="h-11" />
              </Field>
            </div>
          </Section>

          <Section title="Skills and languages">
            <TagInput label="Skills" values={form.skills} max={30} onChange={(v) => set('skills', v)} placeholder="e.g. Excel, driving, customer service" />
            <TagInput label="Languages" values={form.languages} max={10} onChange={(v) => set('languages', v)} placeholder="e.g. Wolaytta, English" />
          </Section>

          <Section title="Work experience">
            {form.experience.map((x, i) => (
              <ExperienceRow key={i} value={x} onChange={(v) => set('experience', form.experience.map((e, j) => (j === i ? v : e)))}
                onRemove={() => set('experience', form.experience.filter((_, j) => j !== i))} />
            ))}
            {form.experience.length < 10 && (
              <Button type="button" variant="outline" onClick={() => set('experience', [...form.experience, { title: '', place: '', startMonth: '', endMonth: '', description: '' }])}>
                <Plus /> Add a job or internship
              </Button>
            )}
          </Section>

          <Section title="The work I want">
            <ChoiceRow label="Type" options={WORK_TYPES.map((t) => [t, WORK_TYPE_LABEL[t]])} values={form.workTypes} onToggle={(v) => toggle('workTypes', v)} />
            <ChoiceRow label="Where" options={WORK_PLACES.map((t) => [t, WORK_PLACE_LABEL[t]])} values={form.workPlaces} onToggle={(v) => toggle('workPlaces', v)} />
            <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
              <span>
                <span className="block font-medium">Let employers find me</span>
                <span className="block text-sm text-muted-foreground">Employers who post jobs can see your profile (not your phone) in search. Off: only employers you apply to see it.</span>
              </span>
              <Switch checked={form.publicProfile} onCheckedChange={(v) => set('publicProfile', v)} />
            </label>
          </Section>

          <div className="sticky bottom-16 z-10 flex flex-wrap gap-2 rounded-2xl border bg-background/95 p-3 backdrop-blur md:bottom-3">
            <Button type="submit" size="lg" disabled={save.isPending} className="rounded-full px-8">{save.isPending && <Loader2 className="animate-spin" />}Save profile</Button>
            {profile.data && f.on('auto_cv') && <Button asChild size="lg" variant="outline" className="rounded-full"><Link to="/work/my-cv">See my free CV</Link></Button>}
          </div>
        </form>

        <aside className="space-y-4">
          {profile.data ? <FilesCard profile={profile.data} /> : <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Save your profile first, then add your CV and certificates here.</p>}
          {profile.data && <DeleteCard />}
        </aside>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ChoiceRow({ label, options, values, onToggle }: { label: string; options: string[][]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={values.includes(v)} onClick={() => onToggle(v)}
            className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', values.includes(v) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function TagInput({ label, values, max, onChange, placeholder }: { label: string; values: string[]; max: number; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...new Set([...values, ...parts])].slice(0, max))
    setText('')
  }
  const id = `tag-${label}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm text-primary">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="rounded-full p-0.5 hover:bg-primary/20" onClick={() => onChange(values.filter((x) => x !== v))}><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-11"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add} />
        <Button type="button" variant="outline" className="h-11" onClick={add}>Add</Button>
      </div>
    </div>
  )
}

function ExperienceRow({ value, onChange, onRemove }: { value: Experience; onChange: (v: Experience) => void; onRemove: () => void }) {
  const set = (k: keyof Experience, v: string) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input required aria-label="Job title" placeholder="Job title" maxLength={120} value={value.title} onChange={(e) => set('title', e.target.value)} className="h-11" />
        <Input aria-label="Employer" placeholder="Employer or place" maxLength={120} value={value.place ?? ''} onChange={(e) => set('place', e.target.value)} className="h-11" />
        <label className="space-y-1 text-xs text-muted-foreground">From
          <Input type="month" value={value.startMonth ?? ''} onChange={(e) => set('startMonth', e.target.value)} className="h-11" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">To (empty = now)
          <Input type="month" value={value.endMonth ?? ''} onChange={(e) => set('endMonth', e.target.value)} className="h-11" />
        </label>
      </div>
      <Textarea rows={2} maxLength={600} aria-label="What you did" placeholder="What you did (optional)" value={value.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}><Trash2 /> Remove</Button>
    </div>
  )
}

const KIND_LABEL: Record<FileKind, string> = { CV_UPLOAD: 'My CV (PDF)', CV_PRO: 'Professional CV', CERTIFICATE: 'Certificate', STUDENT_ID: 'Student ID' }

function FilesCard({ profile }: { profile: Profile }) {
  const f = useFeatures()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<FileKind>('CV_UPLOAD')
  const add = useMutation({
    mutationFn: (file: File) => workApi.addFile(kind, file),
    onSuccess: (p) => {
      qc.setQueryData(['work-profile'], p)
      toast.success(kind === 'STUDENT_ID' ? 'Student ID sent. We check it within a day.' : 'File added')
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => workApi.removeFile(id),
    onSuccess: (p) => qc.setQueryData(['work-profile'], p),
    onError: (e) => toast.error(errorText(e)),
  })
  const pick = (k: FileKind) => {
    setKind(k)
    setTimeout(() => input.current?.click())
  }
  const docs = profile.files.filter((x) => x.kind !== 'STUDENT_ID')

  return (
    <>
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">CVs and certificates</h2>
        <p className="text-xs text-muted-foreground">Private. Only employers you apply to can open them. PDF or photo, up to 5 MB.</p>
        <ul className="space-y-2">
          {docs.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-xl border p-2">
              <FileText className="size-4 shrink-0 text-primary" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => workApi.openMyFile(x.id).catch((e) => toast.error(errorText(e)))}>
                <span className="block truncate text-sm font-medium hover:underline">{x.fileName}</span>
                <span className="block text-xs text-muted-foreground">{KIND_LABEL[x.kind]} · {shortDate(x.createdAt)}</span>
              </button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${x.fileName}`} onClick={() => remove.mutate(x.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={add.isPending} onClick={() => pick('CV_UPLOAD')}><Upload /> Upload CV (PDF)</Button>
          <Button variant="outline" size="sm" disabled={add.isPending} onClick={() => pick('CERTIFICATE')}><Upload /> Certificate</Button>
        </div>
        <input ref={input} type="file" className="hidden" accept={kind === 'CV_UPLOAD' ? 'application/pdf' : 'application/pdf,image/jpeg,image/png,image/webp'}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) add.mutate(file)
            e.target.value = ''
          }} />
        {add.isPending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Uploading…</p>}
      </div>

      {f.on('student_badge') && profile.status === 'STUDENT' && (
        <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="flex items-center gap-2 font-bold"><GraduationCap className="size-5 text-primary" /> Verified student</h2>
          {profile.studentStatus === 'APPROVED' ? (
            <p className="text-sm"><StudentBadge /> Employers see the badge, and you get {f.number('student_discount')}% off professional CVs.</p>
          ) : profile.studentStatus === 'SUBMITTED' ? (
            <p className="text-sm text-muted-foreground">We're checking your student ID. Usually within a day.</p>
          ) : (
            <>
              {profile.studentStatus === 'REJECTED' && <p className="text-sm text-destructive">Not approved: {profile.studentNote}</p>}
              <p className="text-sm text-muted-foreground">Upload a photo of your student ID to get the badge and {f.number('student_discount')}% off professional CVs. Only our team sees it.</p>
              <Button size="sm" disabled={add.isPending} onClick={() => pick('STUDENT_ID')}><Upload /> Upload student ID</Button>
            </>
          )}
        </div>
      )}
    </>
  )
}

function DeleteCard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sure, setSure] = useState(false)
  const del = useMutation({
    mutationFn: workApi.deleteProfile,
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['work-profile'] })
      toast.success('Your profile and files are deleted')
      navigate('/work')
    },
    onError: (e) => toast.error(errorText(e)),
  })
  return (
    <div className="space-y-2 rounded-2xl border p-4 text-sm">
      <p className="font-medium">Delete my profile</p>
      <p className="text-muted-foreground">Removes your profile, CVs and certificates. Employers you applied to keep only the application status.</p>
      {sure ? (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" disabled={del.isPending} onClick={() => del.mutate()}>Yes, delete</Button>
          <Button variant="outline" size="sm" onClick={() => setSure(false)}>Keep it</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setSure(true)}><Trash2 /> Delete</Button>
      )}
    </div>
  )
}
