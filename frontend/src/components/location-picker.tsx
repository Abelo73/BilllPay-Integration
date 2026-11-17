import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { LocateFixed, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

export type Pin = { lat: number; lng: number }

/** Wolaita Sodo, where the map opens when no pin is set yet. */
const SODO: [number, number] = [6.8603, 37.7495]

const pinIcon = () =>
  L.divIcon({ className: 'sodo-pin', html: '<span class="sodo-pin-dot sodo-pin-home">📍</span>', iconSize: [36, 36], iconAnchor: [18, 36] })

/**
 * Lets the person place their address on the map: tap the map, drag the pin, or use their phone's location. Only the
 * owner of the address ever sees the pin.
 */
export function LocationPicker({ value, onChange }: { value: Pin | null; onChange: (pin: Pin | null) => void }) {
  const t = useT()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const placeAt = (ll: L.LatLng) => {
    const m = map.current
    if (!m) return
    if (!marker.current) {
      marker.current = L.marker(ll, { draggable: true, icon: pinIcon() }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        onChangeRef.current({ lat: p.lat, lng: p.lng })
      })
    } else {
      marker.current.setLatLng(ll)
    }
    onChangeRef.current({ lat: ll.lat, lng: ll.lng })
  }

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    map.current = m
    if (value) {
      m.setView([value.lat, value.lng], 16)
      marker.current = L.marker([value.lat, value.lng], { draggable: true, icon: pinIcon() }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        onChangeRef.current({ lat: p.lat, lng: p.lng })
      })
    } else {
      m.setView(SODO, 14)
    }
    m.on('click', (e: L.LeafletMouseEvent) => placeAt(e.latlng))
    // the map is inside a form that may have just opened: measure it again once it is visible
    setTimeout(() => m.invalidateSize(), 50)
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t('Your phone does not share its location. Tap the map instead.'))
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude)
        map.current?.setView(ll, 17)
        placeAt(ll)
        setLocating(false)
      },
      () => {
        setError(t('Allow location in your browser to use this. Or tap the map.'))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const clear = () => {
    marker.current?.remove()
    marker.current = null
    onChangeRef.current(null)
  }

  return (
    <div className="space-y-2">
      <div ref={el} className="h-64 w-full overflow-hidden rounded-xl border sm:h-72" role="application" aria-label={t('Map: tap to place your pin')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={locating} onClick={useMyLocation}>
          <LocateFixed /> {locating ? t('Finding you…') : t('Use my location')}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X /> {t('Remove pin')}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{value ? t('Pin set. Drag it to move it.') : t('No pin yet. Tap the map.')}</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t('Only you see this pin. It helps a rider find your door.')}</p>
    </div>
  )
}
