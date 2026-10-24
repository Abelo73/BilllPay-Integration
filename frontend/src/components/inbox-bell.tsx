import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { inboxApi } from '@/lib/inbox-api'
import { useSession } from '@/store/session'

/** Header bell with the unread count (customers only). */
export function InboxBell() {
  const session = useSession((s) => s.session)
  const enabled = !!session && session.user.role === 'CUSTOMER'
  const { data } = useQuery({ queryKey: ['inbox-unread', session?.user.id], queryFn: inboxApi.unread, enabled, refetchInterval: 30_000 })
  if (!enabled) return null
  const n = data?.unread ?? 0
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-11" aria-label={n ? `Notifications, ${n} new` : 'Notifications'}>
      <Link to="/notifications">
        <Bell className="size-5" />
        {n > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white" aria-hidden>
            {n > 9 ? '9+' : n}
          </span>
        )}
      </Link>
    </Button>
  )
}
