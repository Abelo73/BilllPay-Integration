import { useMutation } from '@tanstack/react-query'
import { KeyRound, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconInput, PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { adminApi, adminToken, staffDevice, type StaffChallenge, type StaffSession } from '@/lib/admin-api'

export function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<StaffChallenge | null>(null)
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(true)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next')
  const done = (session: StaffSession) => {
    adminToken.set({ token: session.token, expiresAt: session.expiresAt, user: session.user })
    navigate(next?.startsWith('/admin') ? next : '/admin', { replace: true })
  }
  const login = useMutation({
    mutationFn: () => adminApi.login(email, password),
    onSuccess: (res) => {
      if ('twoStep' in res && res.twoStep) {
        setChallenge(res)
        setCode(res.devCode ?? '')
      } else {
        done(res as StaffSession)
      }
    },
  })
  const verify = useMutation({
    mutationFn: () => adminApi.verify(challenge!.challengeId, code.trim(), trust),
    onSuccess: (res) => {
      if (res.deviceToken) staffDevice.set(res.deviceToken)
      done(res)
    },
  })

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {challenge ? <KeyRound className="size-4" /> : <LockKeyhole className="size-4" />} {challenge ? 'Enter your code' : 'Admin sign in'}
            </CardTitle>
            <CardDescription>
              {challenge
                ? `We sent a 6-digit code to ${challenge.sentTo || 'your phone and email'}. It works for 10 minutes.`
                : 'Staff accounts only. The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD in .env.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {challenge ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  verify.mutate()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <IconInput icon={KeyRound} id="code" className="h-10 tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
                  {challenge.devCode && <p className="text-xs text-muted-foreground">Test mode: nothing is really sent, so the code is filled in.</p>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="size-4 accent-primary" />
                  Trust this device for 30 days
                </label>
                {verify.error && <p className="text-sm text-destructive">{verify.error.message}</p>}
                <Button type="submit" size="lg" className="h-10 w-full" disabled={code.length !== 6 || verify.isPending}>
                  {verify.isPending && <Loader2 className="animate-spin" />} Verify
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setChallenge(null); setCode(''); verify.reset() }}>
                  Back
                </Button>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  login.mutate()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <IconInput icon={Mail} id="email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="admin@tenashop.local" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput id="password" className="h-10" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </div>
                {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
                <Button type="submit" size="lg" className="h-10 w-full" disabled={login.isPending}>
                  {login.isPending && <Loader2 className="animate-spin" />} Sign in
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
