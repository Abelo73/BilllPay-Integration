import { useSyncExternalStore } from 'react'

/**
 * The chat sound: a short two-note chime made in the browser (no audio file). On or off is remembered on this device.
 * Browsers only allow sound after the person has tapped something, so the first tap on the page unlocks it.
 */

const KEY = 'chat-sound'
const listeners = new Set<() => void>()
let ctx: AudioContext | null = null

export function chatSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setChatSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // private window or blocked storage: the setting lasts only for this page
  }
  listeners.forEach((l) => l())
}

/** Re-renders a component when the setting changes (also from another tab). */
export function useChatSoundOn(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      window.addEventListener('storage', onChange)
      return () => {
        listeners.delete(onChange)
        window.removeEventListener('storage', onChange)
      }
    },
    chatSoundOn,
    () => true,
  )
}

/** Call once on the first tap or key press anywhere; creates the audio context the browser allows after a gesture. */
export function unlockChatSound() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // no audio support: the chime is simply skipped
  }
}

/** The chime, plus a short buzz on phones that support it. Nothing plays when the person has turned sound off. */
export function playChime() {
  if (!chatSoundOn()) return
  try {
    ctx ??= new AudioContext()
    const start = ctx.currentTime
    ;[
      { f: 880, at: 0 },
      { f: 1320, at: 0.14 },
    ].forEach(({ f, at }) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, start + at)
      gain.gain.exponentialRampToValueAtTime(0.25, start + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(start + at)
      osc.stop(start + at + 0.36)
    })
  } catch {
    // audio blocked: the visual alert still shows
  }
  try {
    navigator.vibrate?.(120)
  } catch {
    // not supported
  }
}

/** A system notification, only when the page is in the background and the person allowed them. */
export function notifyIfHidden(title: string, body: string, onClick: () => void) {
  try {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
    const n = new Notification(title, { body, tag: 'chat-message' })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    // some browsers (iOS in a tab) do not allow notifications
  }
}

/** Asks for system notifications once, when the person turns sound on. */
export function askForNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // not supported
  }
}
