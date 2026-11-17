import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const MAX_SECONDS = 120

/** The first recording format this browser can make (Chrome/Android: WebM; iPhone Safari: MP4). */
function pickType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
}

/**
 * Records a voice message from the microphone. Call start() to begin; stop() ends it and hands the recording to
 * onDone; cancel() ends it and throws the recording away. Stops by itself at two minutes.
 */
export function useVoiceRecorder(onDone: (audio: Blob, seconds: number) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const dropIt = useRef(false)
  const done = useRef(onDone)
  done.current = onDone

  const end = (drop: boolean) => {
    dropIt.current = drop
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  const start = async () => {
    if (recorder.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const type = pickType()
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    chunks.current = []
    dropIt.current = false
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      window.clearInterval(timer.current)
      recorder.current = null
      setRecording(false)
      if (dropIt.current) return
      const length = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
      done.current(new Blob(chunks.current, { type: rec.mimeType || type || 'audio/webm' }), length)
    }
    recorder.current = rec
    startedAt.current = Date.now()
    setSeconds(0)
    setRecording(true)
    rec.start(250)
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - startedAt.current) / 1000)
      setSeconds(s)
      if (s >= MAX_SECONDS) end(false)
    }, 250)
  }

  // never leave the microphone on when the page goes away
  useEffect(
    () => () => {
      window.clearInterval(timer.current)
      if (recorder.current && recorder.current.state !== 'inactive') {
        dropIt.current = true
        recorder.current.stop()
      }
    },
    [],
  )

  return { recording, seconds, start, stop: () => end(false), cancel: () => end(true) }
}

/** Formats seconds as m:ss. */
export function clock(total: number) {
  const s = Math.max(0, Math.round(total))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const BARS = Array.from({ length: 28 }, (_, i) => 6 + Math.round(Math.abs(Math.sin(i * 1.7)) * 16))

/** A voice message: play or pause, a bar that fills as it plays, and the length. */
export function VoicePlayer({ src, seconds, mine }: { src: string; seconds: number | null; mine: boolean }) {
  const t = useT()
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  const toggle = () => {
    if (!audio.current) {
      const el = new Audio(src)
      el.preload = 'metadata'
      el.ontimeupdate = () => setPosition(el.currentTime)
      el.onended = () => {
        setPlaying(false)
        setPosition(0)
      }
      audio.current = el
    }
    if (playing) {
      audio.current.pause()
      setPlaying(false)
    } else {
      void audio.current.play().catch(() => setPlaying(false))
      setPlaying(true)
    }
  }

  const total = Math.max(1, seconds ?? 1)
  const done = Math.min(1, position / total)
  return (
    <div className={cn('flex min-w-[200px] items-center gap-2.5 rounded-2xl px-3 py-2', mine ? 'bg-primary text-primary-foreground' : 'border bg-card')}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('Pause') : t('Play voice message')}
        className={cn('grid size-9 shrink-0 place-items-center rounded-full', mine ? 'bg-primary-foreground/20' : 'bg-primary text-primary-foreground')}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
      </button>
      <div className="flex h-7 flex-1 items-center gap-[3px]" aria-hidden>
        {BARS.map((h, i) => (
          <span
            key={i}
            className={cn('w-[3px] rounded-full', i / BARS.length <= done ? 'bg-current' : 'bg-current opacity-35')}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums opacity-80">{clock(playing ? position : (seconds ?? 0))}</span>
    </div>
  )
}
