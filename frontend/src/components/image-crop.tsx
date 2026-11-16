import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Crop a picture to an exact shape before it is uploaded. The frame IS the preview: what the person sees inside it
 * is exactly what gets saved. Drag to move, use the slider to zoom. Nothing is uploaded until they press "Use this".
 */
export function ImageCropDialog({
  file,
  aspect,
  round = false,
  outWidth,
  title,
  onCancel,
  onDone,
}: {
  file: File
  /** width / height of the result, for example 1 (square) or 3 (wide). */
  aspect: number
  /** Show the frame as a circle (profile pictures). The saved file is still square. */
  round?: boolean
  /** Width in pixels of the saved picture. */
  outWidth: number
  title: string
  onCancel: () => void
  onDone: (cropped: File) => void
}) {
  const t = useT()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const frameW = round ? 280 : Math.min(420, typeof window === 'undefined' ? 420 : window.innerWidth - 64)
  const frameH = frameW / aspect

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setError(t('This file is not a picture we can read.'))
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, t])

  // scale at which the picture just covers the frame, then zoomed
  const geo = useMemo(() => {
    if (!img) return null
    const base = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
    const scale = base * zoom
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const maxX = Math.max(0, (drawW - frameW) / 2)
    const maxY = Math.max(0, (drawH - frameH) / 2)
    return { scale, drawW, drawH, maxX, maxY }
  }, [img, zoom, frameW, frameH])

  // keep the frame covered when zooming or resizing
  const clamped = geo ? { x: Math.min(geo.maxX, Math.max(-geo.maxX, offset.x)), y: Math.min(geo.maxY, Math.max(-geo.maxY, offset.y)) } : offset

  const save = () => {
    if (!img || !geo) return
    setSaving(true)
    const outH = Math.round(outWidth / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = outWidth
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setSaving(false)
      return
    }
    // the part of the picture that sits inside the frame
    const left = frameW / 2 - geo.drawW / 2 + clamped.x
    const top = frameH / 2 - geo.drawH / 2 + clamped.y
    const sx = -left / geo.scale
    const sy = -top / geo.scale
    ctx.drawImage(img, sx, sy, frameW / geo.scale, frameH / geo.scale, 0, 0, outWidth, outH)
    canvas.toBlob(
      (blob) => {
        setSaving(false)
        if (blob) onDone(new File([blob], 'picture.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5 shadow-xl">
        <div className="space-y-1">
          <p className="text-lg font-bold">{title}</p>
          <p className="text-sm text-muted-foreground">{t('Drag the picture to move it. Use the slider to zoom. This is exactly what will be saved.')}</p>
        </div>

        <div className="flex justify-center">
          <div
            className={cn('relative touch-none select-none overflow-hidden bg-muted', round ? 'rounded-full' : 'rounded-xl', 'cursor-grab active:cursor-grabbing')}
            style={{ width: frameW, height: frameH }}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, ox: clamped.x, oy: clamped.y }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
          >
            {img && geo && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: geo.drawW,
                  height: geo.drawH,
                  left: frameW / 2 - geo.drawW / 2 + clamped.x,
                  top: frameH / 2 - geo.drawH / 2 + clamped.y,
                }}
              />
            )}
            {!img && !error && <div className="grid h-full place-items-center text-sm text-muted-foreground">{t('Loading…')}</div>}
            {error && <div className="grid h-full place-items-center p-4 text-center text-sm text-destructive">{error}</div>}
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="crop-zoom" className="text-sm font-semibold">{t('Zoom')}</label>
          <input
            id="crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>{t('Cancel')}</Button>
          <Button onClick={save} disabled={!img || !!error || saving}>{saving ? t('Saving…') : t('Use this picture')}</Button>
        </div>
      </div>
    </div>
  )
}
