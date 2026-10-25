import { useMutation } from '@tanstack/react-query'
import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { adminToken, changeOwnPassword } from '@/lib/admin-api'
import { PageHeader } from './shared'

export function AdminMyAccountPage() {
  const user = adminToken.session()?.user
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: () => changeOwnPassword(pw.current, pw.next),
    onSuccess: (session) => {
      adminToken.set(session) // the old token was revoked; keep working with the new one
      setPw({ current: '', next: '', confirm: '' })
      toast.success('Password changed. Your other sessions were signed out.')
    },
    onError: (e) => setError(e.message),
  })

  return (
    <>
      <PageHeader title="My account" description={user ? `${user.fullName} · ${user.email} · ${user.role.toLowerCase()}` : undefined} />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> Change password</CardTitle>
          <CardDescription>Changing it signs you out everywhere else. The first admin's password in .env is only used once, to create the account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              if (pw.next !== pw.confirm) return setError('New passwords don’t match.')
              change.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <PasswordInput id="current" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">New password</Label>
              <PasswordInput id="next" autoComplete="new-password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <PasswordInput id="confirm" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Loader2 className="animate-spin" />} Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
