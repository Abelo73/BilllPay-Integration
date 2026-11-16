import { useSyncExternalStore } from 'react'

import { type Action, addAction, interests, type Interests, prune } from '@/lib/interests-core'

/**
 * The visitor's recent actions for "For you", kept in this browser only (localStorage), never sent to the server.
 * Turned off with one switch on the home page; "Clear" forgets everything.
 */
const KEY = 'sodo-interests-v1'
const OFF_KEY = 'sodo-interests-off'

type State = { on: boolean; actions: Action[] }

function read(): State {
  try {
    const on = localStorage.getItem(OFF_KEY) !== '1'
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return { on, actions: on && Array.isArray(raw) ? prune(raw) : [] }
  } catch {
    return { on: true, actions: [] }
  }
}

let state: State = read()
const listeners = new Set<() => void>()

function save(next: State) {
  state = next
  try {
    if (next.on) {
      localStorage.setItem(KEY, JSON.stringify(next.actions))
      localStorage.removeItem(OFF_KEY)
    } else {
      localStorage.removeItem(KEY)
      localStorage.setItem(OFF_KEY, '1')
    }
  } catch {
    /* storage unavailable (private window): it lasts for this visit */
  }
  listeners.forEach((l) => l())
}

/** Another tab changed it: follow. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === OFF_KEY) save(read())
  })
}

/** Notes one action (a view, a search, an opened category or a saved listing). Does nothing while switched off. */
export function recordInterest(action: Omit<Action, 'at'>) {
  if (!state.on) return
  const next = addAction(state.actions, { ...action, at: Date.now() })
  if (next !== state.actions) save({ ...state, actions: next })
}

export function clearInterests() {
  save({ ...state, actions: [] })
}

export function setInterestsOn(on: boolean) {
  save({ on, actions: on ? state.actions : [] })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The current state, re-rendering when it changes (in this tab or another). */
export function useInterests(): { on: boolean; actions: Action[]; summary: Interests } {
  const s = useSyncExternalStore(subscribe, () => state, () => state)
  return { on: s.on, actions: s.actions, summary: interests(s.actions) }
}

/** The brand line from a listing's details table, when it has one. */
export function brandOf(specs: { key: string; value: string }[] | undefined): string | undefined {
  return specs?.find((s) => s.key === 'brand')?.value
}
