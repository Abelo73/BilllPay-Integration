import { useMutation } from '@tanstack/react-query'
import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { LogoMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { api, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'

/** Forgot password: 1) type your email, 2) type the 6-digit code we emailed and a new password. */
export function ForgotPasswordPage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  const ask = useMutation({
    mutationFn: () => api.forgotPassword(email.trim()),
    onSuccess: (r) => {
      setHint(r.maskedEmail ? t('We sent a code to {email}.', { email: r.maskedEmail }) : r.message)
      if (r.devCode) setCode(r.devCode) // test setup only: the code comes back on screen
      setStep('code')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('Something went wrong. Try again.')),
  })
  const reset = useMutation({
    mutationFn: () => api.resetPassword({ email: email.trim(), code: code.trim(), newPassword: password }),
    onSuccess: (r) => {
      toast.success(r.message)
      navigate('/login?method=email', { replace: true })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('Something went wrong. Try again.')),
  })

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <LogoMark className="h-10" />
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><KeyRound className="size-5" /> {t('Forgot your password?')}</h1>
            <p className="text-sm text-muted-foreground">
              {step === 'email' ? t('Type your email. We will send you a 6-digit code.') : t('Type the code from your email, then a new password.')}
            </p>
          </div>

          {step === 'email' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); ask.mutate() }}>
              <div className="space-y-2">
                <Label htmlFor="fp-email">{t('Email')}</Label>
                <Input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
              </div>
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={ask.isPending}>
                {ask.isPending && <Loader2 className="animate-spin" />} {t('Send code')}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault()
              if (password !== confirm) return toast.error(t('The two passwords are not the same.'))
              reset.mutate()
            }}>
              {hint && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{hint}</p>}
              <div className="space-y-2">
                <Label htmlFor="fp-code">{t('6-digit code')}</Label>
                <Input id="fp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="h-11 text-center text-lg tracking-[0.4em]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-pass">{t('New password')}</Label>
                <PasswordInput id="fp-pass" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t('At least 8 characters.')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-confirm">{t('Type the new password again')}</Label>
                <PasswordInput id="fp-confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={reset.isPending}>
                {reset.isPending && <Loader2 className="animate-spin" />} {t('Save new password')}
              </Button>
              <button type="button" onClick={() => ask.mutate()} disabled={ask.isPending} className="w-full text-sm font-semibold text-brand hover:underline">
                {t('Send a new code')}
              </button>
            </form>
          )}

          <p className="text-center text-sm">
            <Link to="/login?method=email" className="font-semibold text-brand hover:underline">{t('Back to sign in')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
