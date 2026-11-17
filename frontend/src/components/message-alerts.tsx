import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Vibrate, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { chatApi } from '@/lib/chat-api'
import { startLive, stopLive, subscribeLive, useLiveConnected } from '@/lib/live'
import {
  askForNotifications,
  buzz,
  notifyIfHidden,
  playChime,
  setChatSoundOn,
  setChatVibrateOn,
  unlockChatSound,
  useChatSoundOn,
  useChatVibrateOn,
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
  const qc = useQueryClient()
  const token = session?.token ?? null
  const live = useLiveConnected()

  const unread = useQuery({
    queryKey: ['chat-unread'],
    queryFn: chatApi.unread,
    enabled: customer,
    // the live stream announces new messages; the timer is only a safety net while it is up
    refetchInterval: live ? 60_000 : 15_000,
  })

  // the live stream for this sign-in; new messages and notifications refresh the screens that show them
  useEffect(() => {
    if (token) startLive(token)
    else stopLive()
  }, [token])
  useEffect(
    () =>
      subscribeLive(({ type, data }) => {
        if (type === 'inbox') {
          qc.invalidateQueries({ queryKey: ['inbox-unread'] })
          qc.invalidateQueries({ queryKey: ['inbox'] })
        } else if (type === 'chat') {
          qc.invalidateQueries({ queryKey: ['chat-unread'] })
          qc.invalidateQueries({ queryKey: ['chats'] })
          if (data.conversationId) qc.invalidateQueries({ queryKey: ['chat', data.conversationId] })
        }
      }),
    [qc],
  )

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

/** The alerts menu: Sound and Vibrate, each on or off, remembered on this device. */
export function ChatAlertSettings({ className }: { className?: string }) {
  const t = useT()
  const sound = useChatSoundOn()
  const vibrate = useChatVibrateOn()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-11', className)} aria-label={t('Message alerts')}>
          {sound ? <Volume2 /> : <VolumeX />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('Message alerts')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={sound}
          onCheckedChange={(on) => {
            unlockChatSound()
            if (on) {
              askForNotifications()
              setChatSoundOn(true)
              playChime()
            } else {
              setChatSoundOn(false)
            }
          }}
        >
          <Volume2 className="size-4" /> {t('Sound')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={vibrate}
          onCheckedChange={(on) => {
            setChatVibrateOn(!!on)
            if (on) buzz()
          }}
        >
          <Vibrate className="size-4" /> {t('Vibrate')}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
