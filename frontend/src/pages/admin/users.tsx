import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, LockOpen, LogOut, MoreHorizontal, Search, ShieldCheck, UserPlus, UserX, UserCheck, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi, adminToken, type UserRow } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyRow, PageHeader, Pager } from './shared'

const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.'

function RoleBadge({ role }: { role: UserRow['role'] }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-[11px] uppercase', role === 'ADMIN' && 'border-brand/40 bg-brand/10 text-brand', role === 'SUPPORT' && 'bg-accent')}
    >
      {role.toLowerCase()}
    </Badge>
  )
}

function StatusBadge({ u }: { u: UserRow }) {
  if (!u.enabled) return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">disabled</Badge>
  if (u.locked) return <Badge variant="outline" className="border-warning/40 bg-warning/15">locked until {formatDate(u.lockedUntil).split(', ').pop()}</Badge>
  return <Badge variant="outline" className="border-success/30 bg-success/15 text-success">active</Badge>
}

function CreateStaffDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ fullName: '', email: '', role: 'SUPPORT' as 'ADMIN' | 'SUPPORT', password: '' })
  const create = useMutation({
    mutationFn: () => adminApi.createStaff(form),
    onSuccess: (u) => {
      toast.success(`${u.fullName} can now sign in to the admin`)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      onClose()
    },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
          <DialogDescription>Admins can do everything. Support can view orders, payments and webhooks but can't change anything.</DialogDescription>
        </DialogHeader>
        <form id="create-staff" className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <div className="space-y-2">
            <Label htmlFor="s-name">Full name</Label>
            <Input id="s-name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-email">Email</Label>
            <Input id="s-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as 'ADMIN' | 'SUPPORT' })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUPPORT">Support — view only</SelectItem>
                <SelectItem value="ADMIN">Admin — full access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-pw">Temporary password</Label>
            <Input id="s-pw" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT} Share it privately and ask them to change it.</p>
          </div>
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-staff" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Add staff member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const reset = useMutation({
    mutationFn: () => adminApi.resetPassword(user.id, password),
    onSuccess: () => {
      toast.success(`Password reset for ${user.email}. Their other sessions were signed out.`)
      onClose()
    },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Sets a new password for {user.email}, unlocks the account and signs out all of their sessions.</DialogDescription>
        </DialogHeader>
        <form id="reset-pw" className="space-y-2" onSubmit={(e) => { e.preventDefault(); reset.mutate() }}>
          <Label htmlFor="r-pw">New password</Label>
          <Input id="r-pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
          {reset.error && <p className="text-sm text-destructive">{reset.error.message}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="reset-pw" disabled={reset.isPending}>
            {reset.isPending && <Loader2 className="animate-spin" />} Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdminUsersPage() {
  const [kind, setKind] = useState('staff')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<UserRow | null>(null)
  const qc = useQueryClient()
  const me = adminToken.session()?.user.id

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data } = useQuery({
    queryKey: ['admin-users', kind, q, page],
    queryFn: () => adminApi.users({ kind, q, page }),
    placeholderData: keepPreviousData,
  })

  const act = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<UserRow>; done: string }) => fn(),
    onSuccess: (_u, v) => {
      toast.success(v.done)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff who run the admin and customers who shop. Disabling someone or resetting their password signs them out everywhere."
        actions={<Button onClick={() => setCreating(true)}><UserPlus /> Add staff</Button>}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={kind} onValueChange={(v) => { setKind(v); setPage(0) }}>
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={6} text="No users match." />}
              {data?.content.map((u) => {
                const self = u.id === me
                return (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {u.fullName[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{u.fullName}{self && <span className="text-muted-foreground"> (you)</span>}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell><StatusBadge u={u} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.lastLoginAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.email}`}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {u.role !== 'CUSTOMER' && !self && (
                            <DropdownMenuItem onSelect={() => act.mutate({ fn: () => adminApi.updateUser(u.id, { role: u.role === 'ADMIN' ? 'SUPPORT' : 'ADMIN' }), done: `${u.fullName} is now ${u.role === 'ADMIN' ? 'support' : 'an admin'}` })}>
                              <ShieldCheck /> Make {u.role === 'ADMIN' ? 'support (view only)' : 'admin'}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setResetting(u)}><KeyRound /> Reset password</DropdownMenuItem>
                          {u.locked && (
                            <DropdownMenuItem onSelect={() => act.mutate({ fn: () => adminApi.unlockUser(u.id), done: `${u.email} unlocked` })}>
                              <LockOpen /> Unlock
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => act.mutate({ fn: () => adminApi.revokeSessions(u.id), done: `${u.email} signed out everywhere` })}>
                            <LogOut /> Sign out everywhere
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/admin/login-history?userId=${u.id}`}><History /> Login history</Link>
                          </DropdownMenuItem>
                          {!self && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className={u.enabled ? 'text-destructive focus:text-destructive' : ''}
                                onSelect={() => act.mutate({ fn: () => adminApi.updateUser(u.id, { enabled: !u.enabled }), done: `${u.email} ${u.enabled ? 'disabled' : 'enabled'}` })}
                              >
                                {u.enabled ? <><UserX /> Disable account</> : <><UserCheck /> Enable account</>}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={setPage} />}
      {creating && <CreateStaffDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </>
  )
}
