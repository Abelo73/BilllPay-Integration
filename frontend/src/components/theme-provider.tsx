import { useEffect, useState } from 'react'

import { THEME_STORAGE_KEY, ThemeContext, type Theme } from '@/lib/theme'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Light by default, whatever the device prefers. Dark (or following the device) only once the visitor picks it. */
function readStored(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light'
  } catch {
    return 'light'
  }
}

/** Toggles the `dark` class on <html>. index.html applies it before first paint to avoid a flash. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const m = media()
    const onChange = () => setSystemDark(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      // "system" is stored too: removing the key would mean the default, which is now light.
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* storage unavailable: theme lasts for this visit */
    }
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}
