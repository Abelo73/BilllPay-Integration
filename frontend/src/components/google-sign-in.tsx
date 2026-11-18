import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { api, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { Session } from '@/store/session'

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let loading: Promise<void> | null = null
/** Loads Google's sign-in script once. */
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('google script'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** "Continue with Google". Shown only when the server has Google sign-in turned on. */
export function GoogleSignInButton({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const config = useQuery({ queryKey: ['google-config'], queryFn: api.googleConfig, staleTime: Infinity, retry: false })
  const signIn = useMutation({
    mutationFn: (credential: string) => api.googleSignIn(credential),
    onSuccess: onSignedIn,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('Could not sign in with Google. Try again.')),
  })
  const clientId = config.data?.enabled ? config.data.clientId : null

  useEffect(() => {
    if (!clientId || !box.current) return
    let alive = true
    loadGoogle()
      .then(() => {
        if (!alive || !box.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (r) => signIn.mutate(r.credential),
        })
        window.google.accounts.id.renderButton(box.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
        })
      })
      .catch(() => {
        // the script could not load (offline): the email form still works
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  if (!clientId) return null
  return (
    <div className="space-y-4">
      <div ref={box} className="flex min-h-11 justify-center" aria-busy={signIn.isPending} />
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('or with email')}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
