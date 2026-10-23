import { useMutation } from '@tanstack/react-query'
import { Loader2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminApi, adminToken } from '@/lib/admin-api'

export function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next')
  const login = useMutation({
    mutationFn: () => adminApi.login(email, password),
    onSuccess: (res) => {
      adminToken.set(res)
      navigate(next?.startsWith('/admin') ? next : '/admin', { replace: true })
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
              <LockKeyhole className="size-4" /> Admin sign in
            </CardTitle>
            <CardDescription>Staff accounts only. The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD in .env.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                login.mutate()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="admin@tenashop.local" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" className="h-10" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
              <Button type="submit" size="lg" className="h-10 w-full" disabled={login.isPending}>
                {login.isPending && <Loader2 className="animate-spin" />} Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
