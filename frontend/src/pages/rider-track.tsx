import { Car, Footprints, Loader2, MapPin, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ShareStatus = {
  orderNumber: string
  parcelNo: number
  onTheWay: boolean
  ended: boolean
  expiresAt: string
  travelMode: 'CAR' | 'WALK' | null
}

type Mode = 'AUTO' | 'CAR' | 'WALK'

/** Points are sent at most this often. */
const EVERY_MS = 15000

/**
 * The rider's page, opened from the link in their SMS. No sign-in: the link is the key. While sharing, the page sends
 * the phone's location for this one parcel. Sharing ends by itself when the parcel is delivered.
 */
export function RiderTrackPage() {
  const t = useT()
  const { secret = '' } = useParams()
  const base = `/api/rider/share/${encodeURIComponent(secret)}`
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [mode, setMode] = useState<Mode>('AUTO')
  const [lastSent, setLastSent] = useState<Date | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const watch = useRef<number | null>(null)
  const lastSentAt = useRef(0)
  const modeRef = useRef<Mode>('AUTO')
  modeRef.current = mode

  const loadStatus = async () => {
    try {
      const res = await fetch(base, { cache: 'no-store' })
      if (!res.ok) {
        setInvalid(true)
        return
      }
      setStatus((await res.json()) as ShareStatus)
    } catch {
      setProblem(t('No connection right now. Trying again.'))
    }
  }

  useEffect(() => {
    void loadStatus()
    const id = window.setInterval(() => void loadStatus(), 20000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  const stopWatching = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
  }

  useEffect(() => () => stopWatching(), [])

  const sendPoint = async (pos: GeolocationPosition) => {
    const res = await fetch(`${base}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        speed: pos.coords.speed ?? null,
        travelMode: modeRef.current === 'AUTO' ? null : modeRef.current,
      }),
    })
    if (res.status === 410) {
      // the parcel was delivered or the link ended: stop at once
      stopWatching()
      setSharing(false)
      await loadStatus()
      return
    }
    if (!res.ok) throw new Error('send')
    setLastSent(new Date())
    setProblem(null)
  }

  const start = () => {
    if (!navigator.geolocation) {
      setProblem(t('This phone does not share its location.'))
      return
    }
    setProblem(null)
    setSharing(true)
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastSentAt.current < EVERY_MS) return
        lastSentAt.current = now
        sendPoint(pos).catch(() => setProblem(t('Could not send your location. Trying again.')))
      },
      () => {
        setProblem(t('Allow location for this site in your phone settings, then press Start again.'))
        stopWatching()
        setSharing(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  const stop = async () => {
    stopWatching()
    setSharing(false)
    try {
      await fetch(`${base}/stop`, { method: 'POST' })
    } catch {
      // nothing to stop on the server if the connection is down: the next point will just stop too
    }
  }

  if (invalid) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-bold">{t('This link is not valid.')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('Ask the shop to send you a new link.')}</p>
      </div>
    )
  }
  if (!status) {
    return <Loader2 className="mx-auto mt-24 animate-spin text-muted-foreground" />
  }
  const ended = status.ended

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-brand p-5 text-primary-foreground shadow-lg">
        <p className="text-sm text-primary-foreground/80">{t('Order {number}', { number: status.orderNumber })}</p>
        <h1 className="mt-1 text-2xl font-bold">{t('Share your location')}</h1>
        <p className="mt-2 text-sm text-primary-foreground/85">
          {ended
            ? t('This delivery is finished. Thank you!')
            : t('Only this parcel. Sharing stops by itself when it is delivered.')}
        </p>
      </div>

      {!ended && (
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <p className="text-sm">
            <span className="font-semibold">{t('Parcel {n}', { n: status.parcelNo })}</span>{' · '}
            {status.onTheWay ? t('On the way') : t('Waiting for the parcel to leave the shop')}
          </p>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('How you are travelling')}>
            {(
              [
                { key: 'AUTO', label: t('Automatic'), icon: MapPin },
                { key: 'CAR', label: t('Driving'), icon: Car },
                { key: 'WALK', label: t('Walking'), icon: Footprints },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition',
                  mode === m.key ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <m.icon className="size-5" />
                {m.label}
              </button>
            ))}
          </div>

          {sharing ? (
            <Button variant="outline" size="lg" className="h-14 w-full text-base" onClick={stop}>
              <Square /> {t('Stop sharing')}
            </Button>
          ) : (
            <Button size="lg" className="h-14 w-full text-base" onClick={start}>
              <Play /> {t('Start sharing')}
            </Button>
          )}

          <p className="text-xs text-muted-foreground" role="status">
            {sharing && lastSent
              ? t('Last sent at {time}', { time: lastSent.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
              : sharing
                ? t('Finding your location…')
                : t('Press Start when you leave the shop. Keep this page open while you ride.')}
          </p>
          {problem && <p className="text-sm text-destructive">{problem}</p>}
        </div>
      )}
    </div>
  )
}
