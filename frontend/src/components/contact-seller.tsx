import { useMutation } from '@tanstack/react-query'
import { Loader2, Phone, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { request } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useFeatures } from '@/lib/features'
import { useSession } from '@/store/session'

type Contact = { name: string; phone: string; whatsapp: string | null; telegram: string | null }

/** WhatsApp glyph (lucide has none). */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  )
}

/**
 * Jiji-style buying (online payment off): the buyer reveals the seller's phone to call or message them on WhatsApp,
 * and agrees on payment and pickup themselves. Chat in the app is offered next to it.
 */
export function ContactSeller({ productId, slug }: { productId: number; slug: string }) {
  const t = useT()
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const features = useFeatures()
  const [contact, setContact] = useState<Contact | null>(null)
  const reveal = useMutation({
    mutationFn: () => request<Contact>(`/products/${productId}/contact`),
    onSuccess: setContact,
    onError: (e) => toast.error(e.message),
  })
  if (!features.on('show_seller_phone')) return null

  if (contact) {
    return (
      <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">{contact.name}</p>
        <p className="text-2xl font-bold tracking-wide tabular-nums">{contact.phone}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="lg" className="h-11">
            <a href={`tel:${contact.phone}`}><Phone /> {t('Call')}</a>
          </Button>
          {contact.whatsapp && (
            <Button asChild size="lg" variant="outline" className="h-11">
              <a href={contact.whatsapp} target="_blank" rel="noreferrer"><WhatsAppIcon /> WhatsApp</a>
            </Button>
          )}
        </div>
      </div>
    )
  }
  return (
    <Button
      size="lg"
      className="h-12 w-full text-base"
      disabled={reveal.isPending}
      onClick={() => (session ? reveal.mutate() : navigate(`/login?next=${encodeURIComponent(`/product/${slug}`)}`))}
    >
      {reveal.isPending ? <Loader2 className="animate-spin" /> : <Phone />} {session ? t('Show phone number') : t('Sign in to see the phone number')}
    </Button>
  )
}

/** Shown under the contact buttons while online payment is off. */
export function SafetyTips() {
  const t = useT()
  return (
    <div className="space-y-2 rounded-2xl border bg-muted/30 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" /> {t('Buy safely')}</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>{t('Meet in a public place in Sodo and check the item before you pay.')}</li>
        <li>{t('Never send money before you see the item.')}</li>
        <li>{t('Prefer sellers with the Verified badge. Report anything suspicious.')}</li>
      </ul>
    </div>
  )
}
