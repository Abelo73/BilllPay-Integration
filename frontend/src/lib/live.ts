import { useSyncExternalStore } from 'react'

/**
 * The live connection to the server (Server-Sent Events). It is opened with the normal sign-in header, which the
 * browser's built-in EventSource cannot send, so it uses fetch and reads the stream by hand. If the connection drops it
 * reconnects with a growing pause. While it is down, the screens fall back to their own refresh timers.
 */

export type LiveEvent = { type: string; data: { conversationId?: number } }
type Handler = (e: LiveEvent) => void

const handlers = new Set<Handler>()
const stateListeners = new Set<() => void>()
let connected = false
let current: { token: string; abort: AbortController } | null = null

function setConnected(on: boolean) {
  if (connected === on) return
  connected = on
  stateListeners.forEach((l) => l())
}

/** Hears every live event (new message, typing, read, notification). Returns the function that stops listening. */
export function subscribeLive(h: Handler): () => void {
  handlers.add(h)
  return () => {
    handlers.delete(h)
  }
}

/** True while the live connection is open. Screens use it to slow their own refresh timers. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      stateListeners.add(onChange)
      return () => stateListeners.delete(onChange)
    },
    () => connected,
    () => false,
  )
}

/** Opens the stream for this sign-in. Calling it again with the same token does nothing. */
export function startLive(token: string) {
  if (current?.token === token) return
  stopLive()
  const abort = new AbortController()
  current = { token, abort }
  void run(token, abort.signal)
}

export function stopLive() {
  current?.abort.abort()
  current = null
  setConnected(false)
}

function dispatch(type: string, raw: string) {
  let data: LiveEvent['data'] = {}
  try {
    data = JSON.parse(raw || '{}')
  } catch {
    return
  }
  handlers.forEach((h) => {
    try {
      h({ type, data })
    } catch {
      // one listener failing must not stop the others
    }
  })
}

async function run(token: string, signal: AbortSignal) {
  let pause = 1000
  while (!signal.aborted) {
    try {
      const res = await fetch('/api/live/stream', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal,
      })
      // 401 means the sign-in is no longer valid: stop, and the normal sign-in flow takes over
      if (res.status === 401) return stopLive()
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
      setConnected(true)
      pause = 1000
      await readEvents(res.body, dispatch)
    } catch {
      // network drop or the server restarted: fall through and reconnect
    }
    setConnected(false)
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, pause))
    pause = Math.min(pause * 2, 30_000)
  }
}

/** Reads "event:" and "data:" lines; a blank line ends one event. Lines starting with ":" are the heartbeat. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (type: string, data: string) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let type = 'message'
  let data: string[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
      if (line === '') {
        if (data.length) onEvent(type, data.join('\n'))
        type = 'message'
        data = []
      } else if (line.startsWith('event:')) {
        type = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''))
      }
    }
  }
}
