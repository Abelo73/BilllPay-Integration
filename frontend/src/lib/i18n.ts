import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { am } from '@/locales/am'

/**
 * Site languages. The English text is the key: t('Search') looks the sentence up in the Amharic dictionary and falls
 * back to English when a line isn't translated yet, so a missing translation never shows a blank or a code.
 * Wolaytta comes next, once a native speaker has written it.
 */
export type Lang = 'en' | 'am'

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'am', label: 'አማርኛ', short: 'አማ' },
]

const DICTS: Record<Lang, Record<string, string>> = { en: {}, am }

type Vars = Record<string, string | number>

/** "Hello {name}" + { name: 'Hana' } → "Hello Hana". */
export function translate(lang: Lang, text: string, vars?: Vars) {
  const s = DICTS[lang][text] ?? text
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

function firstLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('am') ? 'am' : 'en'
  } catch {
    return 'en'
  }
}

type LangState = { lang: Lang; setLang: (lang: Lang) => void }

export const useLang = create<LangState>()(
  persist((set) => ({ lang: firstLang(), setLang: (lang) => set({ lang }) }), { name: 'sodo-lang' }),
)

/** Keeps <html lang> right, for screen readers and the Ethiopic font. */
function applyHtmlLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
applyHtmlLang(useLang.getState().lang)
useLang.subscribe((s) => applyHtmlLang(s.lang))

/** const t = useT(); t('Search') */
export function useT() {
  const lang = useLang((s) => s.lang)
  return useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang])
}

/** For code outside React (toasts in callbacks, page titles). */
export function t(text: string, vars?: Vars) {
  return translate(useLang.getState().lang, text, vars)
}
