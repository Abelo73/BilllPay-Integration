import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export type ThemeState = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

export const THEME_STORAGE_KEY = 'tenashop-theme'

export const ThemeContext = createContext<ThemeState>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)
