import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { NavLink } from 'react-router'

import { chatApi } from '@/lib/chat-api'
import { useT } from '@/lib/i18n'
import { useSession } from '@/store/session'

/** Unread conversations for the signed-in customer (0 when signed out). */
export function useUnreadChats() {
  const session = useSession((s) => s.session)
  const { data } = useQuery({
    queryKey: ['chats-unread', session?.user.id],
    queryFn: chatApi.unread,
    enabled: !!session && session.user.role === 'CUSTOMER',
    refetchInterval: 30_000,
  })
  return data?.unread ?? 0
}

/** "Chats" in the phone menu, with a red count when something is unread. */
export function ChatsNavLink({ className }: { className: (s: { isActive: boolean }) => string }) {
  const t = useT()
  const unread = useUnreadChats()
  return (
    <NavLink to="/chats" className={(s) => `${className(s)} relative`} aria-label={unread ? t('Chats, {n} unread', { n: unread }) : undefined}>
      <MessageCircle className="size-[22px]" /> {t('Chats')}
      {unread > 0 && (
        <span className="absolute right-3 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white" aria-hidden>
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </NavLink>
  )
}
