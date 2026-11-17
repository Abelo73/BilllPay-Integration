import { useQuery } from '@tanstack/react-query'
import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { chatApi } from '@/lib/chat-api'
import {
  askForNotifications,
  notifyIfHidden,
  playChime,
  setChatSoundOn,
  unlockChatSound,
  useChatSoundOn,
} from '@/lib/chat-sound'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Inside an open chat the thread itself plays the chime, so the app-wide alert stays quiet there. */
const IN_A_CHAT = /^\/chats\/\d+/

/**
 * Runs everywhere in the app for signed-in customers: plays the chime and shows a toast when a new message arrives
 * (unless the person is already reading that chat), sends the system notification when the page is in the background,
 * and keeps them marked online for the other side.
 */
export function MessageAlerts() {
  const t = useT()
  const session = useSession((s) => s.session)
  const customer = session?.user.role === 'CUSTOMER'
  const seen = useRef<number | null>(null)

  const unread = useQuery({
    queryKey: ['chat-unread'],
    queryFn: chatApi.unread,
    enabled: customer,
    refetchInterval: 15_000,
  })

  // the first tap or key press unlocks sound (browsers block it until the person has interacted)
  useEffect(() => {
    const onGesture = () => unlockChatSound()
    window.addEventListener('pointerdown', onGesture, { once: true })
    window.addEventListener('keydown', onGesture, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])

  // online for the other side: now, then every 30 s while the page is visible
  useEffect(() => {
    if (!customer) return
    const ping = () => {
      if (!document.hidden) chatApi.presence().catch(() => {})
    }
    ping()
    const id = window.setInterval(ping, 30_000)
    document.addEventListener('visibilitychange', ping)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [customer])

  // a rise in the unread count is a new message
  useEffect(() => {
    if (!customer) {
      seen.current = null
      return
    }
    const now = unread.data?.unread
    if (now === undefined) return
    const before = seen.current
    seen.current = now
    if (before === null || now <= before || IN_A_CHAT.test(window.location.pathname)) return
    playChime()
    const open = () => window.location.assign('/chats')
    toast(t('New message'), { description: t('Open your chats to read it.'), action: { label: t('Open'), onClick: open } })
    notifyIfHidden(t('New message'), t('Open Sodo Gebeya to read it.'), open)
  }, [customer, unread.data?.unread, t])

  return null
}

/** The speaker button: sound on or off for chat, remembered on this device. */
export function ChatSoundToggle({ className }: { className?: string }) {
  const t = useT()
  const on = useChatSoundOn()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-11', className)}
      aria-pressed={on}
      aria-label={on ? t('Turn message sound off') : t('Turn message sound on')}
      title={on ? t('Message sound: on') : t('Message sound: off')}
      onClick={() => {
        unlockChatSound()
        if (!on) askForNotifications()
        setChatSoundOn(!on)
        if (!on) playChime() // a short chime, so they know it works
      }}
    >
      {on ? <Volume2 /> : <VolumeX />}
    </Button>
  )
}
