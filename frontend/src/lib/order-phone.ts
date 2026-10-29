import { orderContact } from '@/lib/format'
import { useSession } from '@/store/session'

/** The phone that proves a guest owns the order; signed-in buyers need none. null = ask for it first. */
export function useOrderPhone(order: string) {
  const signedIn = useSession((s) => !!s.session)
  const saved = order ? orderContact.phone(order) : null
  return saved ?? (signedIn ? '' : null)
}
