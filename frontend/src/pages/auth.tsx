import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, FlaskConical, Loader2, MessageSquareText, ShieldCheck, Truck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { LogoMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError, type PhoneCodeSent } from '@/lib/api'
import { type Session, useSession } from '@/store/session'

/** Only same-site paths are accepted as a post-login destination. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
}

function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-8 sm:px-6 md:py-14 lg:grid-cols-2">
      <div className="hidden space-y-6 lg:block">
        <img src="/products/habesha-netela.jpg" alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-3"><MessageSquareText className="size-4 text-success" /> Sign in with your phone, no password to remember</li>
          <li className="flex items-center gap-3"><Truck className="size-4 text-success" /> Track every order and delivery</li>
          <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-success" /> Payments stay on BillPay. We never see your wallet or bank details</li>
          <li className="flex items-center gap-3"><CheckCircle2 className="size-4 text-success" /> Faster checkout with your address saved</li>
        </ul>
      </div>
      <Card className="w-full">
        <CardContent className="space-y-6 pt-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <LogoMark className="size-12 rounded-2xl [&_svg]:size-6" />
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

function Field(props: { id: string; label: string; error?: string } & React.ComponentProps<'input'>) {
  const { id, label, error, ...input } = props
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-11" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...input} />
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function ErrorBox({ error }: { error: Error | null }) {
  if (!error) return null
  return <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>
}

/** Seconds left until `until` (a Date.now() value), ticking every second. */
function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/**
 * Phone sign-in (design S13): number → 6-digit SMS code → name, the first time only.
 * The same flow signs people in and creates accounts.
 */
function PhoneSignIn({ onSignedIn }: { onSignedIn: (s: Session, created: boolean) => void }) {
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState<(PhoneCodeSent & { at: number }) | null>(null)
  const [code, setCode] = useState('')
  const [askName, setAskName] = useState(false)
  const [fullName, setFullName] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const resendIn = useCountdown(sent ? sent.at + sent.resendInSeconds * 1000 : 0)

  const start = useMutation({
    mutationFn: (p: string) => api.phoneStart(p),
    onSuccess: (s) => {
      setSent({ ...s, at: Date.now() })
      setCode('')
      setTimeout(() => codeRef.current?.focus(), 50)
    },
  })
  const verify = useMutation({
    mutationFn: () => api.phoneVerify(sent!.phone, code, askName ? fullName : undefined),
    onSuccess: (s) => onSignedIn(s, askName),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'NAME_REQUIRED') setAskName(true)
      if (e instanceof ApiError && (e.code === 'CODE_EXPIRED' || e.code === 'TOO_MANY_TRIES')) setCode('')
    },
  })

  // fill the 6 digits → check right away (not on the name step)
  useEffect(() => {
    if (code.length === 6 && sent && !askName && !verify.isPending && !verify.isSuccess) verify.mutate()
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sent) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          start.mutate(phone)
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="phone">Your phone number</Label>
          <div className="flex h-12 overflow-hidden rounded-xl border bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30">
            <span className="flex items-center border-r px-3 text-base font-bold" aria-hidden>+251</span>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              placeholder="911 234 567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <ErrorBox error={start.error} />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={start.isPending}>
          {start.isPending && <Loader2 className="animate-spin" />} Send code
        </Button>
        <p className="text-center text-xs text-muted-foreground">We'll text you a 6-digit code. No password needed.</p>
      </form>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        verify.mutate()
      }}
    >
      <p className="text-center text-sm">
        Enter the code we sent to <strong className="whitespace-nowrap">{sent.maskedPhone}</strong>
      </p>
      {sent.testMode && (
        <div className="flex gap-2 rounded-lg bg-warning/20 p-3 text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            SMS test mode: no text was sent.
            {sent.devCode ? <> Your code is <strong className="font-mono tracking-widest">{sent.devCode}</strong>.</> : ' The code is in the backend log.'}
          </span>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          ref={codeRef}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
          disabled={askName}
        />
      </div>
      {askName && (
        <Field id="fullName" label="Your name" autoComplete="name" required autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
      )}
      {verify.error && !(verify.error instanceof ApiError && verify.error.code === 'NAME_REQUIRED') && <ErrorBox error={verify.error} />}
      {askName && <p className="text-sm text-muted-foreground">Welcome to Sodo Gebeya! This is your first sign-in, so tell us your name.</p>}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={verify.isPending || code.length !== 6 || (askName && !fullName.trim())}>
        {verify.isPending && <Loader2 className="animate-spin" />} {askName ? 'Create my account' : 'Continue'}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 font-semibold text-brand hover:underline"
          onClick={() => {
            setSent(null)
            setAskName(false)
            verify.reset()
            start.reset()
          }}
        >
          <ArrowLeft className="size-4" /> Change number
        </button>
        {resendIn > 0 ? (
          <span className="text-muted-foreground">Resend in 0:{String(resendIn).padStart(2, '0')}</span>
        ) : (
          <button type="button" className="min-h-11 font-semibold text-brand hover:underline" disabled={start.isPending} onClick={() => start.mutate(sent.phone)}>
            Send a new code
          </button>
        )}
      </div>
      <ErrorBox error={start.error} />
    </form>
  )
}

function EmailSignIn({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({ mutationFn: () => api.login(email, password), onSuccess: onSignedIn })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        login.mutate()
      }}
    >
      <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <ErrorBox error={login.error} />
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={login.isPending}>
        {login.isPending && <Loader2 className="animate-spin" />} Sign in
      </Button>
    </form>
  )
}

function SwitchMethod({ toEmail, onClick }: { toEmail: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <button type="button" onClick={onClick} className="min-h-11 font-semibold text-brand hover:underline">
        {toEmail ? 'Use email and password instead' : 'Use my phone number instead'}
      </button>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function useFinish() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setSession = useSession((s) => s.setSession)
  return (s: Session, created = false) => {
    setSession(s)
    toast.success(created ? 'Your account is ready!' : `Welcome back, ${s.user.fullName.split(' ')[0]}!`)
    navigate(safeNext(params.get('next')), { replace: true })
  }
}

export function LoginPage() {
  const [params] = useSearchParams()
  const session = useSession((s) => s.session)
  const finish = useFinish()
  const [withEmail, setWithEmail] = useState(params.get('method') === 'email')
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  return (
    <AuthShell title="Sign in" description="Buy and sell in Wolaita Sodo.">
      {withEmail ? <EmailSignIn onSignedIn={(s) => finish(s)} /> : <PhoneSignIn onSignedIn={finish} />}
      <SwitchMethod toEmail={!withEmail} onClick={() => setWithEmail(!withEmail)} />
      <p className="text-center text-sm text-muted-foreground">
        New here? {withEmail ? (
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        ) : (
          <>Just enter your phone. We'll create your account.</>
        )}
      </p>
    </AuthShell>
  )
}

/** Creating an account: phone first (same flow as sign-in); email and password stay available. */
export function RegisterPage() {
  const [params] = useSearchParams()
  const session = useSession((s) => s.session)
  const finish = useFinish()
  const [withEmail, setWithEmail] = useState(params.get('method') === 'email')
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  return (
    <AuthShell title="Create your account" description="Track orders, check out faster, and be first to sell when shops open.">
      {withEmail ? <EmailRegister onDone={(s) => finish(s, true)} /> : <PhoneSignIn onSignedIn={finish} />}
      <SwitchMethod toEmail={!withEmail} onClick={() => setWithEmail(!withEmail)} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

function EmailRegister({ onDone }: { onDone: (s: Session) => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const register = useMutation({
    mutationFn: () => api.register({ fullName: form.fullName, email: form.email, phone: form.phone, password: form.password }),
    onSuccess: onDone,
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') setErrors((e.body.errors as Record<string, string>) ?? {})
    },
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const next: Record<string, string> = {}
        if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
          next.password = 'Use at least 8 characters, including a letter and a number.'
        if (form.password !== form.confirm) next.confirm = 'Passwords don’t match.'
        setErrors(next)
        if (Object.keys(next).length === 0) register.mutate()
      }}
    >
      <Field id="fullName" label="Full name" autoComplete="name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
      <Field id="email" label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
      <Field id="phone" label="Phone (optional)" type="tel" inputMode="tel" autoComplete="tel" placeholder="0911 234 567" value={form.phone} onChange={set('phone')} error={errors.phone} />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
      {register.error && !(register.error instanceof ApiError && register.error.code === 'VALIDATION_FAILED') && <ErrorBox error={register.error} />}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={register.isPending}>
        {register.isPending && <Loader2 className="animate-spin" />} Create account
      </Button>
    </form>
  )
}
