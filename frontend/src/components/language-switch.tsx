import { Languages } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { request } from '@/lib/api'
import { LANGS, useLang, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Saves the language on the account, so SMS and alerts come in it. Quietly ignored when it fails. */
function saveLanguage(lang: Lang) {
  return request('/me/language', { method: 'PUT', body: JSON.stringify({ language: lang }) }).catch(() => undefined)
}

/** Keeps the account's language in step with this device: on sign-in and whenever it changes (customers only). */
export function LanguageSync() {
  const lang = useLang((s) => s.lang)
  const userId = useSession((s) => (s.session?.user.role === 'CUSTOMER' ? s.session.user.id : null))
  useEffect(() => {
    if (userId) void saveLanguage(lang)
  }, [userId, lang])
  return null
}

/** Header button: switches between English and Amharic; the choice is remembered on this device. */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const next = LANGS[(LANGS.findIndex((l) => l.code === lang) + 1) % LANGS.length]
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-11 gap-1 px-2 font-semibold', className)}
      onClick={() => setLang(next.code)}
      aria-label={`Language: ${LANGS.find((l) => l.code === lang)?.label}. Switch to ${next.label}`}
      title={next.label}
    >
      <Languages className="size-4" />
      <span lang={next.code}>{next.short}</span>
    </Button>
  )
}
