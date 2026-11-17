import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, FlaskConical, Loader2, Mail, Phone, ShieldCheck, Truck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { LogoMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { IconInput, PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { api, ApiError, type EmailCodeSent } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { type Session, useSession } from '@/store/session'

/** Only same-site paths are accepted as a post-login destination. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
}

function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-8 sm:px-6 md:py-14 lg:grid-cols-2">
      <div className="hidden space-y-6 lg:block">
        <img src="/products/habesha-netela.jpg" alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-3"><Truck className="size-4 text-success" /> {t('Track your orders')}</li>
          <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-success" /> {t('Pay safely with BillPay')}</li>
        </ul>
      </div>
      <Card className="w-full">
        <CardContent className="space-y-6 pt-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <LogoMark className="h-12" />
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
  const { id, label, error, type, ...input } = props
  const common = { id, className: 'h-11', 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined, ...input }
  const icon = type === 'email' ? Mail : type === 'tel' ? Phone : input.autoComplete === 'name' ? UserRound : null
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {type === 'password' ? (
        <PasswordInput {...common} />
      ) : icon ? (
        <IconInput icon={icon} type={type} {...common} />
      ) : (
        <Input type={type} {...common} />
      )}
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
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

function EmailSignIn({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // set when the password was right but the email was never confirmed: a code is emailed and asked for here
  const [confirm, setConfirm] = useState<{ maskedEmail: string; resendAt: number } | null>(null)
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const resendIn = useCountdown(confirm?.resendAt ?? 0)
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: onSignedIn,
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        const wait = Number(e.body.resendInSeconds ?? 60)
        setConfirm({ maskedEmail: String(e.body.maskedEmail ?? email), resendAt: Date.now() + wait * 1000 })
        setCode('')
        setTimeout(() => codeRef.current?.focus(), 50)
      }
    },
  })
  const confirmEmail = useMutation({
    mutationFn: () => api.confirmEmail(email, password, code),
    onSuccess: onSignedIn,
    onError: (e) => {
      if (e instanceof ApiError && (e.code === 'CODE_EXPIRED' || e.code === 'TOO_MANY_TRIES' || e.code === 'WRONG_CODE')) setCode('')
    },
  })

  if (confirm) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6) confirmEmail.mutate()
        }}
      >
        <div className="rounded-xl bg-accent p-4 text-sm text-accent-foreground">
          <p className="font-bold">{t('Confirm your email once')}</p>
          <p className="mt-1">{t('We sent a 6-digit code to {email}. Enter it to sign in. You only need to do this once.', { email: confirm.maskedEmail })}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-code">{t('6-digit code')}</Label>
          <Input
            ref={codeRef}
            id="confirm-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
          />
        </div>
        <ErrorBox error={confirmEmail.error} />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={confirmEmail.isPending || code.length !== 6}>
          {confirmEmail.isPending && <Loader2 className="animate-spin" />} {t('Confirm and sign in')}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="flex min-h-11 items-center gap-1 font-semibold text-brand hover:underline"
            onClick={() => {
              setConfirm(null)
              login.reset()
            }}
          >
            <ArrowLeft className="size-4" /> {t('Change email')}
          </button>
          {resendIn > 0 ? (
            <span className="text-muted-foreground">{t('Resend in {time}', { time: `0:${String(resendIn).padStart(2, '0')}` })}</span>
          ) : (
            <button type="button" className="min-h-11 font-semibold text-brand hover:underline" disabled={login.isPending} onClick={() => login.mutate()}>
              {t('Send a new code')}
            </button>
          )}
        </div>
      </form>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        login.mutate()
      }}
    >
      <Field id="email" label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field id="password" label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="-mt-2 text-right">
        <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="text-sm font-semibold text-brand hover:underline">{t('Forgot password?')}</Link>
      </div>
      <ErrorBox error={login.error} />
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={login.isPending}>
        {login.isPending && <Loader2 className="animate-spin" />} {t('Sign in')}
      </Button>
    </form>
  )
}

function useFinish() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setSession = useSession((s) => s.setSession)
  const t = useT()
  return (s: Session, created = false, fallback?: string) => {
    setSession(s)
    toast.success(created ? t('Your account is ready!') : t('Welcome back, {name}!', { name: s.user.fullName.split(' ')[0] }))
    navigate(safeNext(params.get('next') ?? fallback ?? null), { replace: true })
  }
}

/** The "next" part of a link, kept when switching between sign-in and sign-up. */
function nextQuery(params: URLSearchParams) {
  const next = params.get('next')
  return next ? `?next=${encodeURIComponent(next)}` : ''
}

/** Sign in with email and password. Phone sign-in is switched off for now. */
export function LoginPage() {
  const t = useT()
  const [params] = useSearchParams()
  const session = useSession((s) => s.session)
  const finish = useFinish()
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  return (
    <AuthShell title={t('Sign in')} description={t('Use your email and password.')}>
      <EmailSignIn onSignedIn={(s) => finish(s)} />
      <p className="text-center text-sm text-muted-foreground">
        {t('New here?')}{' '}
        <Link to={`/register${nextQuery(params)}`} className="font-semibold text-brand hover:underline">
          {t('Create an account')}
        </Link>
      </p>
    </AuthShell>
  )
}

/**
 * Create an account, as a buyer or as a seller. Both use email and a password; a seller is sent on to open a shop.
 * Without ?role= the page asks which one.
 */
export function RegisterPage() {
  const t = useT()
  const [params] = useSearchParams()
  const session = useSession((s) => s.session)
  const finish = useFinish()
  const role = params.get('role') === 'seller' ? 'seller' : params.get('role') === 'buyer' ? 'buyer' : null
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  if (!role) {
    return (
      <AuthShell title={t('Create an account')} description={t('What do you want to do?')}>
        <div className="grid gap-3">
          <Button asChild size="lg" className="h-auto justify-start whitespace-normal py-4 text-left">
            <Link to={`/register?role=buyer${nextQuery(params).replace('?', '&')}`}>
              <span className="block">
                <span className="block text-base font-bold">{t('Buy')}</span>
                <span className="block text-sm font-normal opacity-90">{t('Shop from sellers in Sodo')}</span>
              </span>
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-auto justify-start whitespace-normal py-4 text-left">
            <Link to={`/register?role=seller${nextQuery(params).replace('?', '&')}`}>
              <span className="block">
                <span className="block text-base font-bold">{t('Sell')}</span>
                <span className="block text-sm font-normal opacity-90">{t('Open a shop. It is free.')}</span>
              </span>
            </Link>
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t('Have an account?')}{' '}
          <Link to={`/login${nextQuery(params)}`} className="font-semibold text-brand hover:underline">{t('Sign in')}</Link>
        </p>
      </AuthShell>
    )
  }

  const seller = role === 'seller'
  return (
    <AuthShell
      title={seller ? t('Sell on Sodo Gebeya') : t('Create your account')}
      description={seller ? t('Step 1 of 2: make your account. Then open your shop.') : t('It takes one minute.')}
    >
      <EmailRegister onDone={(s) => finish(s, true, seller ? '/sell' : '/account')} />
      <p className="text-center text-sm text-muted-foreground">
        <Link to={`/register${nextQuery(params)}`} className="font-semibold text-brand hover:underline">{t('Back')}</Link>
        {' · '}
        {t('Have an account?')}{' '}
        <Link to={`/login${nextQuery(params)}`} className="font-semibold text-brand hover:underline">{t('Sign in')}</Link>
      </p>
    </AuthShell>
  )
}

function EmailRegister({ onDone }: { onDone: (s: Session) => void }) {
  const t = useT()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Set once the shop has emailed a code (sign-up with email codes on): the form then asks for the code
  const [sent, setSent] = useState<(EmailCodeSent & { at: number }) | null>(null)
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const resendIn = useCountdown(sent ? sent.at + sent.resendInSeconds * 1000 : 0)

  const codeSent = (s: EmailCodeSent) => {
    setSent({ ...s, at: Date.now() })
    setCode('')
    setTimeout(() => codeRef.current?.focus(), 50)
  }
  const register = useMutation({
    mutationFn: () =>
      api.register({ fullName: form.fullName, email: form.email, password: form.password, code: sent ? code : undefined }),
    onSuccess: onDone,
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') setErrors((e.body.errors as Record<string, string>) ?? {})
      if (e instanceof ApiError && e.code === 'EMAIL_CODE_SENT') codeSent(e.body as unknown as EmailCodeSent)
      if (e instanceof ApiError && (e.code === 'CODE_EXPIRED' || e.code === 'TOO_MANY_TRIES')) setCode('')
    },
  })
  const resend = useMutation({ mutationFn: () => api.emailResend(form.email), onSuccess: codeSent })

  // fill the 6 digits → create the account right away
  useEffect(() => {
    if (code.length === 6 && sent && !register.isPending && !register.isSuccess) register.mutate()
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  if (sent) {
    const [sentBefore, sentAfter] = t('Enter the code we emailed to {email}').split('{email}')
    const [codeBefore, codeAfter] = t('Your code is {code}.').split('{code}')
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          register.mutate()
        }}
      >
        <p className="text-center text-sm">
          {sentBefore}<strong className="break-all">{sent.maskedEmail}</strong>{sentAfter}
        </p>
        {sent.testMode && (
          <div className="flex gap-2 rounded-lg bg-warning/20 p-3 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <span>
              {t('Email test mode: no email was sent.')}
              {sent.devCode ? <> {codeBefore}<strong className="font-mono tracking-widest">{sent.devCode}</strong>{codeAfter}</> : ` ${t('The code is in the backend log.')}`}
            </span>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email-code">{t('6-digit code')}</Label>
          <Input
            ref={codeRef}
            id="email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
          />
        </div>
        {register.error && !(register.error instanceof ApiError && register.error.code === 'EMAIL_CODE_SENT') && <ErrorBox error={register.error} />}
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={register.isPending || code.length !== 6}>
          {register.isPending && <Loader2 className="animate-spin" />} {t('Create my account')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("Can't find it? Check your spam folder.")}</p>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="flex min-h-11 items-center gap-1 font-semibold text-brand hover:underline"
            onClick={() => {
              setSent(null)
              register.reset()
              resend.reset()
            }}
          >
            <ArrowLeft className="size-4" /> {t('Change email')}
          </button>
          {resendIn > 0 ? (
            <span className="text-muted-foreground">{t('Resend in {time}', { time: `0:${String(resendIn).padStart(2, '0')}` })}</span>
          ) : (
            <button type="button" className="min-h-11 font-semibold text-brand hover:underline" disabled={resend.isPending} onClick={() => resend.mutate()}>
              {t('Send a new code')}
            </button>
          )}
        </div>
        <ErrorBox error={resend.error} />
      </form>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const next: Record<string, string> = {}
        if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
          next.password = t('Use at least 8 characters, including a letter and a number.')
        if (form.password !== form.confirm) next.confirm = t('Passwords don’t match.')
        setErrors(next)
        if (Object.keys(next).length === 0) register.mutate()
      }}
    >
      <Field id="fullName" label={t('Full name')} autoComplete="name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
      <Field id="email" label={t('Email')} type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
      <Field id="password" label={t('Password')} type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} />
      <Field id="confirm" label={t('Confirm password')} type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
      {register.error && !(register.error instanceof ApiError && ['VALIDATION_FAILED', 'EMAIL_CODE_SENT'].includes(register.error.code ?? '')) && <ErrorBox error={register.error} />}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={register.isPending}>
        {register.isPending && <Loader2 className="animate-spin" />} {t('Create account')}
      </Button>
    </form>
  )
}
