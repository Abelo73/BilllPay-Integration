import { useQuery } from '@tanstack/react-query'
import { GraduationCap, Loader2, Mail, MapPin, Phone, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { LogoSymbol } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import { JOB_TYPE_LABEL, TALENT_STATUS_LABEL, WORK_PLACE_LABEL, workApi, type Profile } from '@/lib/work-api'
import { useSession } from '@/store/session'
import { monthText, Notice, useRequireSession, WorkNav } from './shared'

type Lang = 'EN' | 'AM'
type Look = 'simple' | 'modern'

const T: Record<Lang, Record<string, string>> = {
  EN: { about: 'Profile', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', wants: 'Looking for', made: 'Made with Sodo Gebeya', verified: 'Verified student', present: 'present', graduated: 'Graduation' },
  AM: { about: 'ስለ እኔ', experience: 'የሥራ ልምድ', education: 'ትምህርት', skills: 'ክህሎቶች', languages: 'ቋንቋዎች', wants: 'የምፈልገው ሥራ', made: 'በሶዶ ገበያ የተሰራ', verified: 'የተረጋገጠ ተማሪ', present: 'አሁን', graduated: 'የምረቃ ዓመት' },
}

const WORK_TYPE: Record<string, string> = { ...JOB_TYPE_LABEL, WEEKEND: 'Weekends' }

/** /work/my-cv: the free CV made from the profile (J2). Saved as PDF with the browser's print. */
export function MyCvPage() {
  const redirect = useRequireSession('/work/my-cv')
  const f = useFeatures()
  const email = useSession((s) => s.session?.user.email ?? null)
  const profile = useQuery({ queryKey: ['work-profile'], queryFn: workApi.profile, retry: false, enabled: !redirect })
  const [lang, setLang] = useState<Lang>('EN')
  const [look, setLook] = useState<Look>('modern')

  if (redirect) return redirect
  if (f.loaded && !f.on('auto_cv')) return <><WorkNav /><Notice title="The free CV is coming soon" /></>
  if (profile.isLoading) return <><WorkNav /><div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></>
  if (profile.error instanceof ApiError && profile.error.code === 'NO_PROFILE') {
    return (
      <>
        <WorkNav />
        <Notice title="Your CV is made from your profile">
          <Link to="/work/profile?next=/work/my-cv" className="font-semibold text-primary underline">Make your free profile</Link> first. It takes 3 minutes.
        </Notice>
      </>
    )
  }
  if (!profile.data) return null
  const p = profile.data

  return (
    <>
      <WorkNav />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <h1 className="mr-auto text-2xl font-extrabold tracking-tight">My free CV</h1>
          <Toggle value={look} options={[['modern', 'Modern'], ['simple', 'Simple']]} onChange={(v) => setLook(v as Look)} label="Design" />
          <Toggle value={lang} options={[['EN', 'English'], ['AM', 'አማርኛ']]} onChange={(v) => setLang(v as Lang)} label="Headings" />
          <Button onClick={() => window.print()} className="rounded-full"><Printer /> Save as PDF</Button>
        </div>
        <p className="text-sm text-muted-foreground print:hidden">
          Tap <strong>Save as PDF</strong>, then choose “Save as PDF” as the printer. To change anything, <Link to="/work/profile" className="text-primary underline">edit your profile</Link>.
          {f.on('cv_service') && <> Want it written by a professional? <Link to="/work/cv" className="text-primary underline">See CV packages</Link>.</>}
        </p>
        <div className="overflow-x-auto rounded-2xl border bg-muted/40 p-2 sm:p-6 print:overflow-visible print:border-0 print:bg-transparent print:p-0">
          <CvSheet p={p} email={email} lang={lang} look={look} />
        </div>
      </div>
    </>
  )
}

function Toggle({ value, options, onChange, label }: { value: string; options: string[][]; onChange: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border p-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn('rounded-full px-3 py-1 text-sm', value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
      ))}
    </div>
  )
}

/** A4-shaped, always light (it's paper), Noto Sans Ethiopic for Amharic headings. */
function CvSheet({ p, email, lang, look }: { p: Profile; email: string | null; lang: Lang; look: Look }) {
  const t = T[lang]
  const modern = look === 'modern'
  const wants = [...p.workTypes.map((w) => WORK_TYPE[w] ?? w), ...p.workPlaces.map((w) => WORK_PLACE_LABEL[w as keyof typeof WORK_PLACE_LABEL] ?? w)]

  const contact = (
    <div className={cn('space-y-1.5 text-[12.5px]', modern ? 'text-white/90' : 'text-[#13201A]/80')}>
      {p.phone && <p className="flex items-center gap-2"><Phone className="size-3.5" />{p.phone}</p>}
      {email && <p className="flex items-center gap-2 break-all"><Mail className="size-3.5" />{email}</p>}
      <p className="flex items-center gap-2"><MapPin className="size-3.5" />Wolaita Sodo</p>
    </div>
  )

  const side = (
    <>
      {p.skills.length > 0 && (
        <div>
          <h3 className={cn('mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em]', modern ? 'text-[#E39B2D]' : '')}>{t.skills}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {p.skills.map((s) => <li key={s} className={cn('rounded px-2 py-0.5 text-[11.5px]', modern ? 'bg-white/15' : 'border border-[#13201A]/20')}>{s}</li>)}
          </ul>
        </div>
      )}
      {p.languages.length > 0 && (
        <div>
          <h3 className={cn('mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em]', modern ? 'text-[#E39B2D]' : '')}>{t.languages}</h3>
          <p className="text-[12.5px]">{p.languages.join(' · ')}</p>
        </div>
      )}
      {wants.length > 0 && (
        <div>
          <h3 className={cn('mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em]', modern ? 'text-[#E39B2D]' : '')}>{t.wants}</h3>
          <p className="text-[12.5px]">{wants.join(' · ')}</p>
        </div>
      )}
    </>
  )

  const main = (
    <>
      {p.about && (
        <section>
          <H modern={modern}>{t.about}</H>
          <p className="whitespace-pre-line text-[13px] leading-relaxed">{p.about}</p>
        </section>
      )}
      {p.experience.length > 0 && (
        <section>
          <H modern={modern}>{t.experience}</H>
          <ul className="space-y-3">
            {p.experience.map((x, i) => (
              <li key={i} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[13.5px] font-bold">{x.title}{x.place && <span className="font-normal text-[#13201A]/70"> · {x.place}</span>}</p>
                  {(x.startMonth || x.endMonth) && <p className="text-[11.5px] text-[#13201A]/60">{monthText(x.startMonth)} – {x.endMonth ? monthText(x.endMonth) : t.present}</p>}
                </div>
                {x.description && <p className="mt-0.5 whitespace-pre-line text-[12.5px] text-[#13201A]/80">{x.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(p.school || p.fieldOfStudy) && (
        <section className="break-inside-avoid">
          <H modern={modern}>{t.education}</H>
          <p className="text-[13.5px] font-bold">{p.fieldOfStudy}</p>
          <p className="text-[12.5px] text-[#13201A]/75">{[p.school, p.graduationYear && `${t.graduated} ${p.graduationYear}`].filter(Boolean).join(' · ')}</p>
        </section>
      )}
    </>
  )

  return (
    <div lang={lang === 'AM' ? 'am' : 'en'}
      className="mx-auto flex min-h-[1123px] w-[794px] flex-col bg-white font-sans text-[#13201A] shadow-lg print:min-h-0 print:w-full print:shadow-none"
      style={{ fontFamily: "'Inter Variable', 'Noto Sans Ethiopic', system-ui, sans-serif" }}>
      {modern ? (
        <div className="grid flex-1 grid-cols-[240px_1fr]">
          <aside className="space-y-6 bg-[#0E5A43] p-7 text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
            <div className="grid size-20 place-items-center rounded-full bg-white/15 text-2xl font-extrabold">
              {p.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            {contact}
            {side}
          </aside>
          <div className="space-y-6 p-8">
            <header className="space-y-1 border-b-4 border-[#E39B2D] pb-4">
              <h2 className="text-[30px] font-extrabold leading-tight tracking-tight">{p.fullName}</h2>
              <p className="text-[15px] font-semibold text-[#13785A]">{p.headline || TALENT_STATUS_LABEL[p.status]}</p>
              {p.verifiedStudent && <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E5A43]"><GraduationCap className="size-3.5" />{t.verified}</p>}
            </header>
            {main}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-6 p-12">
          <header className="space-y-2 text-center">
            <h2 className="text-[30px] font-extrabold tracking-tight">{p.fullName}</h2>
            <p className="text-[14px] text-[#13201A]/75">{p.headline || TALENT_STATUS_LABEL[p.status]}{p.verifiedStudent && ` · ${t.verified}`}</p>
            <p className="text-[12.5px] text-[#13201A]/70">{[p.phone, email, 'Wolaita Sodo'].filter(Boolean).join('  ·  ')}</p>
          </header>
          {main}
          <div className="grid grid-cols-3 gap-6 text-[#13201A] [&_h3]:border-b [&_h3]:border-[#13201A]/20 [&_h3]:pb-1">{side}</div>
        </div>
      )}
      <footer className="flex items-center justify-center gap-1.5 border-t border-[#13201A]/10 py-2 text-[10.5px] text-[#13201A]/50">
        <LogoSymbol className="size-3.5" /> {t.made}
      </footer>
    </div>
  )
}

function H({ modern, children }: { modern: boolean; children: React.ReactNode }) {
  return (
    <h3 className={cn('mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em]', modern ? 'text-[#0E5A43]' : 'border-b border-[#13201A]/20 pb-1 text-[#13201A]')}>{children}</h3>
  )
}
