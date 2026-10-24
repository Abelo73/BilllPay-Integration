import { Download } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { canInstall, isInstalled, promptInstall, subscribeInstall } from '@/lib/pwa'
import { cn } from '@/lib/utils'

/** "Install the app" — only shown when the browser can install Sodo Gebeya (Android Chrome, desktop Chrome/Edge). */
export function InstallApp({ className }: { className?: string }) {
  const available = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  if (!available || isInstalled()) return null
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border bg-accent p-3 text-accent-foreground', className)}>
      <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Get the Sodo Gebeya app</p>
        <p className="text-xs opacity-80">Opens from your home screen, works on slow connections. Free, no Play Store needed.</p>
      </div>
      <Button size="sm" className="h-10 shrink-0" onClick={() => void promptInstall()}>
        <Download /> Install
      </Button>
    </div>
  )
}
