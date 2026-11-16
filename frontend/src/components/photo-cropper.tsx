import { Maximize, Minimize, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Listing photos are 4:3 (landscape): phone cameras shoot 4:3, so most photos fit without losing anything, and every
 * card in the shop has that shape. Before upload the seller places the photo in a 4:3 frame:
 *   - drag to move, zoom with the slider, mouse wheel or two fingers, rotate in quarter turns;
 *   - "Fill" cuts the photo to the frame; "Fit" keeps the whole photo and fills the sides with a soft blur of it
 *     (good for tall items such as clothes or bottles).
 * The result is a JPEG of at most 1600 × 1200 made in the browser, so uploads stay small on mobile data.
 */
export const OUT_WIDTH = 1600
export const OUT_HEIGHT = 1200
const MAX_ZOOM = 4

type Mode = 'fill' | 'fit'

export type CropRequest = { file: File; index: number; total: number }

/** Shows one photo at a time; resolves with the cropped file, the original ("Use as it is"), or null ("Leave out"). */
export function PhotoCropDialog({ request, onDone }: { request: CropRequest | null; onDone: (file: File | null) => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="max-w-xl gap-4 p-4 sm:p-6">
        {request && <Cropper key={`${request.file.name}-${request.index}`} request={request} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  )
}

function Cropper({ request, onDone }: { request: CropRequest; onDone: (file: File | null) => void }) {
  const t = useT()
  const frame = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [url, setUrl] = useState<string>('')
  const [failed, setFailed] = useState(false)
  const [frameW, setFrameW] = useState(480)
  const [mode, setMode] = useState<Mode>('fill')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  // load the photo (browsers apply the phone's EXIF rotation to <img> and to canvas drawing)
  useEffect(() => {
    const u = URL.createObjectURL(request.file)
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setFailed(true)
    el.src = u
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [request.file])

  // the frame's width on screen (it follows the dialog's width)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setFrameW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const frameH = (frameW * 3) / 4

  const turned = rotation % 180 !== 0
  const natW = img ? (turned ? img.naturalHeight : img.naturalWidth) : 1
  const natH = img ? (turned ? img.naturalWidth : img.naturalHeight) : 1
  const base = mode === 'fill' ? Math.max(frameW / natW, frameH / natH) : Math.min(frameW / natW, frameH / natH)
  const scale = base * zoom

  /** Keeps the photo covering the frame in Fill; in Fit it may move only as far as it is larger than the frame. */
  const clamp = useCallback(
    (o: { x: number; y: number }, s = scale) => {
      const maxX = Math.max(0, (natW * s - frameW) / 2)
      const maxY = Math.max(0, (natH * s - frameH) / 2)
      return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) }
    },
    [natW, natH, frameW, frameH, scale],
  )
  useEffect(() => setOffset((o) => clamp(o)), [clamp])

  const setZoomClamped = (z: number) => setZoom(Math.min(MAX_ZOOM, Math.max(1, z)))

  const onPointerDown = (e: ReactPointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const last = pointers.current.get(e.pointerId)
    if (!last) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      setZoomClamped((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist)
      return
    }
    setOffset((o) => clamp({ x: o.x + e.clientX - last.x, y: o.y + e.clientY - last.y }))
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // the mouse wheel zooms (a native listener, so the page doesn't scroll at the same time)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key]) {
      e.preventDefault()
      setOffset((o) => clamp({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] }))
    } else if (e.key === '+' || e.key === '=') setZoomClamped(zoom * 1.15)
    else if (e.key === '-') setZoomClamped(zoom / 1.15)
  }

  /** How many of the photo's own pixels end up across the frame; below 640 it will look soft. */
  const sourceWidthUsed = Math.round(Math.min(natW, frameW / scale))
  const lowResolution = !!img && sourceWidthUsed < 640

  const save = async () => {
    if (!img) return
    setBusy(true)
    try {
      onDone(await render(img, { mode, rotation, scale, offset, frameW, frameH, name: request.file.name }))
    } catch {
      onDone(request.file) // the browser couldn't draw it: send the original, the server still resizes it
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.total > 1 ? t('Place photo {i} of {n}', { i: request.index + 1, n: request.total }) : t('Place your photo')}</DialogTitle>
        <DialogDescription>{t('Drag to move it, zoom to fill the frame. Listings show photos in this shape (4:3).')}</DialogDescription>
      </DialogHeader>

      <div
        ref={frame}
        tabIndex={0}
        role="application"
        aria-label={t('Photo frame: drag or use the arrow keys to move, + and - to zoom')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKey}
        className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-muted outline-none ring-primary focus-visible:ring-2 active:cursor-grabbing"
        style={{ height: frameH }}
      >
        {failed && <p className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">{t('This photo could not be opened here. You can still send it as it is.')}</p>}
        {img && mode === 'fit' && (
          <img src={url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" style={{ transform: `rotate(${rotation}deg) scale(1.2)` }} />
        )}
        {img && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: img.naturalWidth,
              height: img.naturalHeight,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
            }}
          />
        )}
        {/* thirds grid, to help line things up */}
        <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-white/25" />)}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomClamped(Number(e.target.value))}
            aria-label={t('Zoom')}
            className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border p-0.5" role="group" aria-label={t('Photo shape')}>
            {(['fill', 'fit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => { setMode(m); setZoom(1); setOffset({ x: 0, y: 0 }) }}
                className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {m === 'fill' ? <Maximize className="size-4" /> : <Minimize className="size-4" />}
                {m === 'fill' ? t('Fill') : t('Fit whole photo')}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-full" onClick={() => { setRotation((r) => (r + 90) % 360); setOffset({ x: 0, y: 0 }) }}>
            <RotateCw /> {t('Rotate')}
          </Button>
        </div>
        {lowResolution && (
          <p className="rounded-lg bg-warning/20 px-3 py-2 text-xs">{t('This photo is small, so it may look blurry. A sharper photo sells better.')}</p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onDone(null)}>{t('Leave out')}</Button>
          <Button type="button" variant="ghost" onClick={() => onDone(request.file)}>{t('Use as it is')}</Button>
        </div>
        <Button type="button" onClick={save} disabled={!img || busy} className="rounded-full px-6">
          {t('Use photo')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Draws the framed photo at 1600 × 1200 and returns it as a JPEG file. */
async function render(
  img: HTMLImageElement,
  o: { mode: Mode; rotation: number; scale: number; offset: { x: number; y: number }; frameW: number; frameH: number; name: string },
): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = OUT_WIDTH
  canvas.height = OUT_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  const k = OUT_WIDTH / o.frameW
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, OUT_WIDTH, OUT_HEIGHT)
  ctx.imageSmoothingQuality = 'high'
  if (o.mode === 'fit') {
    // a soft blur of the photo behind it: drawn tiny, then stretched (works in every browser, unlike ctx.filter)
    const tiny = document.createElement('canvas')
    tiny.width = 32
    tiny.height = 24
    const tc = tiny.getContext('2d')
    if (tc) {
      const turned = o.rotation % 180 !== 0
      const w = turned ? img.naturalHeight : img.naturalWidth
      const h = turned ? img.naturalWidth : img.naturalHeight
      const cover = Math.max(32 / w, 24 / h)
      tc.translate(16, 12)
      tc.rotate((o.rotation * Math.PI) / 180)
      tc.scale(cover, cover)
      tc.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      ctx.globalAlpha = 0.75
      ctx.drawImage(tiny, 0, 0, OUT_WIDTH, OUT_HEIGHT)
      ctx.globalAlpha = 1
    }
  }
  ctx.save()
  ctx.translate(OUT_WIDTH / 2 + o.offset.x * k, OUT_HEIGHT / 2 + o.offset.y * k)
  ctx.rotate((o.rotation * Math.PI) / 180)
  ctx.scale(o.scale * k, o.scale * k)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  ctx.restore()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('no blob')
  const base = o.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}
