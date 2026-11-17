/** The last searches on this device (never sent to the server). A few are kept, newest first. */
const KEY = 'recent-searches'
const MAX = 6

export function recentSearches(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberSearch(term: string) {
  const clean = term.trim().slice(0, 80)
  if (clean.length < 2) return
  try {
    const next = [clean, ...recentSearches().filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage blocked: nothing is remembered
  }
}

export function forgetSearches() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
