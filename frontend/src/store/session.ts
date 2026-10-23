import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Role = 'CUSTOMER' | 'SUPPORT' | 'ADMIN'

export type SessionUser = {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: Role
}

export type Session = { token: string; expiresAt: string; user: SessionUser }

type SessionState = {
  session: Session | null
  setSession: (session: Session) => void
  setUser: (user: SessionUser) => void
  clear: () => void
}

/** The shopper's sign-in (customers only). Staff sessions live separately in admin-api. */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      setUser: (user) => set((s) => (s.session ? { session: { ...s.session, user } } : s)),
      clear: () => set({ session: null }),
    }),
    {
      name: 'tenashop-session',
      storage: createJSONStorage(() => localStorage),
      // drop sessions that expired while the tab was closed
      merge: (persisted, current) => {
        const p = persisted as Partial<SessionState> | undefined
        const valid = p?.session && new Date(p.session.expiresAt).getTime() > Date.now()
        return { ...current, session: valid ? p!.session! : null }
      },
    },
  ),
)

export const sessionToken = () => useSession.getState().session?.token ?? null
