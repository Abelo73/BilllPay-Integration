import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Loader2, LockKeyhole, ShieldCheck, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api'
import { useSession } from '@/store/session'

/** Only same-site paths are accepted as a post-login destination. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
}

function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div className="hidden space-y-6 lg:block">
        <img src="/products/clay-jebena.jpg" alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-3"><CheckCircle2 className="size-4 text-success" /> See every order and its payment status</li>
          <li className="flex items-center gap-3"><Truck className="size-4 text-success" /> Faster checkout with your details saved</li>
          <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-success" /> Payments stay on BillPay — we never see your card or wallet</li>
        </ul>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LockKeyhole className="size-5 text-brand" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

function Field(props: { id: string; label: string; error?: string } & React.ComponentProps<'input'>) {
  const { id, label, error, ...input } = props
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" aria-invalid={!!error} {...input} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (s) => {
      setSession(s)
      toast.success(`Welcome back, ${s.user.fullName.split(' ')[0]}!`)
      navigate(safeNext(params.get('next')), { replace: true })
    },
  })
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  return (
    <AuthShell title="Sign in" description="Welcome back to TenaShop.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {login.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{login.error.message}</p>}
        <Button type="submit" size="lg" className="h-10 w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}

export function RegisterPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const register = useMutation({
    mutationFn: () => api.register({ fullName: form.fullName, email: form.email, phone: form.phone, password: form.password }),
    onSuccess: (s) => {
      setSession(s)
      toast.success('Your account is ready!')
      navigate(safeNext(params.get('next')), { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') setErrors((e.body.errors as Record<string, string>) ?? {})
    },
  })
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <AuthShell title="Create your account" description="Track orders and check out faster. Guest checkout still works too.">
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
        {register.error && !(register.error instanceof ApiError && register.error.code === 'VALIDATION_FAILED') && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{register.error.message}</p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full" disabled={register.isPending}>
          {register.isPending && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
