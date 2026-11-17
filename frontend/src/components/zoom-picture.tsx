import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useRef, useState, type ReactNode, type TouchEvent, type WheelEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const MIN = 1
const MAX = 3

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n))

/**
 * Wraps a picture (or its initials) so that tapping it opens the picture full screen. Inside, zoom with the slider,
 * the mouse wheel, a pinch on a phone, or a double-tap.
 */
export function ZoomPicture({ src, alt, children, className }: { src: string | null; alt: string; children: ReactNode; className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const pinch = useRef<number | null>(null)

  if (!src) return <>{children}</>

  const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Open picture of {name}', { name: alt })}
        className={cn('group relative rounded-full transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring', className)}
      >
        {children}
        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-card text-foreground opacity-0 shadow transition group-hover:opacity-100">
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setZoom(1)
        }}
      >
        <DialogContent className="max-w-[min(94vw,680px)] border-0 bg-black/90 p-3 text-white sm:p-5">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div
            className="flex max-h-[70vh] items-center justify-center overflow-hidden"
            onWheel={(e: WheelEvent) => setZoom((z) => clamp(z - e.deltaY * 0.002))}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
            onTouchStart={(e) => {
              if (e.touches.length === 2) pinch.current = distance(e)
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2 && pinch.current) {
                const now = distance(e)
                setZoom((z) => clamp(z * (now / pinch.current!)))
                pinch.current = now
              }
            }}
            onTouchEnd={() => {
              pinch.current = null
            }}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-h-[70vh] max-w-full select-none object-contain transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 pt-3">
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label={t('Zoom out')} onClick={() => setZoom((z) => clamp(z - 0.25))}>
              <Minus />
            </Button>
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={0.05}
              value={zoom}
              aria-label={t('Zoom')}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-40 accent-white sm:w-56"
            />
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label={t('Zoom in')} onClick={() => setZoom((z) => clamp(z + 0.25))}>
              <Plus />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label={t('Reset zoom')} onClick={() => setZoom(1)}>
              <RotateCcw />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
