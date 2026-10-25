import { BadgeCheck, BriefcaseBusiness, FileText, Inbox, PenLine, Sparkles, UserRound } from 'lucide-react'
import { Navigate, NavLink } from 'react-router'

import { ApiError } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Sends guests to sign in, then back here. */
export function useRequireSession(next: string) {
  const session = useSession((s) => s.session)
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  if (session.user.role !== 'CUSTOMER') {
    return <Notice title="Use a customer account">Jobs and CVs are for customer accounts. Staff manage them in the admin pages.</Notice>
  }
  return null
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-extrabold">{title}</h1>
      {children && <p className="mt-2 text-muted-foreground">{children}</p>}
    </div>
  )
}

/** The tabs on top of every Jobs page. */
export function WorkNav() {
  const f = useFeatures()
  const signedIn = !!useSession((s) => s.session)
  const items = [
    { to: '/work', label: 'Jobs', icon: BriefcaseBusiness, end: true, show: f.on('job_posts') },
    { to: '/work/profile', label: 'My profile', icon: UserRound, show: f.on('talent_profiles') },
    { to: '/work/my-cv', label: 'Free CV', icon: FileText, show: f.on('auto_cv') },
    { to: '/work/applications', label: 'Applied', icon: Inbox, show: signedIn && f.on('one_tap_apply') },
    { to: '/work/cv', label: 'Professional CV', icon: Sparkles, show: f.on('cv_service') },
    { to: '/work/employer', label: 'Hiring', icon: PenLine, show: f.on('job_posts') },
  ].filter((i) => i.show || !f.loaded)
  return (
    <nav aria-label="Jobs" className="border-b bg-card/60 print:hidden">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <i.icon className="size-4" />
            {i.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function StudentBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary', className)}>
      <BadgeCheck className="size-3.5" /> Verified student
    </span>
  )
}

export const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong')

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const monthText = (m: string | null) => {
  if (!m) return 'now'
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export function daysLeft(deadline: string) {
  const d = Math.ceil((new Date(deadline + 'T23:59:59').getTime() - Date.now()) / 86_400_000)
  return d <= 0 ? 'Closes today' : d === 1 ? '1 day left' : `${d} days left`
}
