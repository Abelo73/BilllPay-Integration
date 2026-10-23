import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { EmptyRow, PageHeader, Pager } from './shared'

const REASONS: Record<string, string> = {
  SUCCESS: 'Signed in',
  REGISTERED: 'Created account',
  WRONG_PASSWORD: 'Wrong password',
  NOW_LOCKED: 'Wrong password — account locked',
  LOCKED: 'Tried while locked',
  DISABLED: 'Account disabled',
  UNKNOWN_EMAIL: 'No such account',
  WRONG_PORTAL: 'Wrong sign-in page',
}

/** Short, readable device name from a User-Agent string. */
function device(ua: string | null) {
  if (!ua) return '—'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl/i.test(ua) ? 'curl' : 'Other'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

export function AdminLoginHistoryPage() {
  const [params] = useSearchParams()
  const userId = params.get('userId') ?? undefined
  const [page, setPage] = useState(0)
  const { data } = useQuery({
    queryKey: ['admin-login-events', userId, page],
    queryFn: () => adminApi.loginEvents({ userId, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })

  return (
    <>
      <PageHeader
        title="Login history"
        description="Every sign-in attempt on the store and the admin. Five wrong passwords lock an account for 15 minutes."
        actions={userId && <Button asChild variant="outline" size="sm"><Link to="/admin/login-history">Show everyone</Link></Button>}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="pr-4">Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={6} text="No sign-in attempts yet." />}
              {data?.content.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
                  <TableCell className="text-sm">{e.email ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[11px]">{e.portal === 'ADMIN' ? 'admin' : 'store'}</Badge></TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      {e.success ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
                      {REASONS[e.reason] ?? e.reason}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.ip && ['::1', '0:0:0:0:0:0:0:1', '127.0.0.1'].includes(e.ip) ? 'localhost' : (e.ip ?? '—')}
                  </TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground" title={e.userAgent ?? ''}>{device(e.userAgent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  )
}
