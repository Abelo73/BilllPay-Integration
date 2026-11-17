import { useSyncExternalStore } from 'react'

/**
 * The chat sound: a short two-note chime made in the browser (no audio file). On or off is remembered on this device.
 * Browsers only allow sound after the person has tapped something, so the first tap on the page unlocks it.
 */

const KEY = 'chat-sound'
const VIBRATE_KEY = 'chat-vibrate'
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

/** Vibrate on phones; on by default, its own switch (works even when sound is off). */
export function chatVibrateOn(): boolean {
  try {
    return localStorage.getItem(VIBRATE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setChatVibrateOn(on: boolean) {
  try {
    localStorage.setItem(VIBRATE_KEY, on ? 'on' : 'off')
  } catch {
    // storage blocked: the setting lasts only for this page
  }
  listeners.forEach((l) => l())
}

function subscribeSettings(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Re-renders a component when the sound setting changes (also from another tab). */
export function useChatSoundOn(): boolean {
  return useSyncExternalStore(subscribeSettings, chatSoundOn, () => true)
}

/** Re-renders a component when the vibrate setting changes. */
export function useChatVibrateOn(): boolean {
  return useSyncExternalStore(subscribeSettings, chatVibrateOn, () => true)
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

/** A short buzz on phones that support it, if vibrate is on. */
export function buzz() {
  if (!chatVibrateOn()) return
  try {
    navigator.vibrate?.([120, 60, 120])
  } catch {
    // not supported
  }
}

/** The chime (if sound is on) and the buzz (if vibrate is on). */
export function playChime() {
  buzz()
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
