import { Download, Share, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { canInstall, isInstalled, promptInstall, subscribeInstall } from '@/lib/pwa'
import { cn } from '@/lib/utils'

/** After "Not now" the banner stays away for a week. */
const DISMISS_KEY = 'install-dismissed'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < WEEK_MS
  } catch {
    return false
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // storage blocked: the banner may come back next visit
  }
}

/** iPhone and iPad: Apple does not offer an install button, so we show the steps instead. */
function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * How the app can be installed here: 'native' (the browser offers an Install button: Android Chrome, desktop Chrome or
 * Edge), 'ios' (show the Add to Home Screen steps), or null (already installed, or not possible here).
 */
function useInstallMode(): 'native' | 'ios' | null {
  const native = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  if (isInstalled()) return null
  if (native) return 'native'
  if (isIos()) return 'ios'
  return null
}

function IosSteps() {
  const t = useT()
  return (
    <ol className="mt-3 space-y-2 text-sm">
      <li className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
        <span>
          {t('Tap the')} <Share className="inline size-4 align-text-bottom" /> {t('Share button at the bottom of Safari.')}
        </span>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
        <span>{t('Choose “Add to Home Screen”.')}</span>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
        <span>{t('Tap “Add”. Sodo Gebeya opens from your home screen.')}</span>
      </li>
    </ol>
  )
}

/** The install card at the bottom of the site: stays available after the banner is dismissed. */
export function InstallApp({ className }: { className?: string }) {
  const t = useT()
  const mode = useInstallMode()
  if (!mode) return null
  return (
    <div className={cn('rounded-2xl border bg-accent p-3 text-accent-foreground', className)}>
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">{t('Get the Sodo Gebeya app')}</p>
          <p className="text-xs opacity-80">{t('Opens from your home screen, works on slow connections. Free, no Play Store needed.')}</p>
        </div>
        {mode === 'native' && (
          <Button size="sm" className="h-10 shrink-0" onClick={() => void promptInstall()}>
            <Download /> {t('Install')}
          </Button>
        )}
      </div>
      {mode === 'ios' && <IosSteps />}
    </div>
  )
}

/**
 * A banner a few seconds after the first visit: install the app for a better experience. Shown only where installing is
 * possible, and not again for a week after "Not now".
 */
export function InstallBanner() {
  const t = useT()
  const mode = useInstallMode()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!mode || dismissedRecently()) return
    const id = window.setTimeout(() => setOpen(true), 3000)
    return () => window.clearTimeout(id)
  }, [mode])

  if (!open || !mode) return null
  const close = () => {
    rememberDismiss()
    setOpen(false)
  }

  return (
    <div
      role="dialog"
      aria-label={t('Install the app')}
      className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border bg-card p-4 shadow-xl md:inset-x-auto md:bottom-6 md:right-6 md:w-96"
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t('Install Sodo Gebeya')}</p>
          <p className="text-sm text-muted-foreground">
            {t('Use it from your home screen for a better experience. It opens faster and works on slow connections.')}
          </p>
        </div>
        <button type="button" onClick={close} aria-label={t('Not now')} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent">
          <X className="size-5" />
        </button>
      </div>

      {mode === 'native' ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={close}>
            {t('Not now')}
          </Button>
          <Button
            className="h-11 flex-1"
            onClick={async () => {
              const installed = await promptInstall()
              if (installed) setOpen(false)
              else close()
            }}
          >
            <Download /> {t('Install')}
          </Button>
        </div>
      ) : (
        <>
          <IosSteps />
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={close}>
              {t('Not now')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
