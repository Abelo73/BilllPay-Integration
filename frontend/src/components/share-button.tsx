import { Check, Copy, Send, Share2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/lib/i18n'

/**
 * Share a listing. The link goes through /api/share/p/<slug>, which gives Telegram and WhatsApp a preview card (title,
 * price, photo) and then opens the product page. Phones get their own share sheet when they have one.
 */
export function ShareButton({ slug, title }: { slug: string; title: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/api/share/p/${encodeURIComponent(slug)}`
  const text = `${title} — Sodo Gebeya`
  const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('Copy this link'), url)
    }
  }
  if (native) {
    return (
      <Button variant="outline" className="h-10 rounded-full" onClick={() => navigator.share({ title: text, url }).catch(() => undefined)}>
        <Share2 /> {t('Share')}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full"><Share2 /> {t('Share')}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <Send /> Telegram
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
            <Share2 /> WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); copy() }}>
          {copied ? <Check /> : <Copy />} {copied ? t('Copied') : t('Copy link')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
