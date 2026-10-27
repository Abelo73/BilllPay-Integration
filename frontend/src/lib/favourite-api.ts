import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { request, type Product } from '@/lib/api'
import { useSession } from '@/store/session'

/** Favourites (the heart). {@code product} null = the listing is gone; inStore false = hidden or sold out. */
export type Favourite = { productId: number; product: Product | null; inStore: boolean; priceWhenSaved: number | null; savedAt: string }

export const favouriteApi = {
  mine: () => request<Favourite[]>('/me/favourites'),
  ids: () => request<number[]>('/me/favourites/ids'),
  add: (productId: number) => request<{ favourite: boolean }>(`/me/favourites/${productId}`, { method: 'PUT' }),
  remove: (productId: number) => request<{ favourite: boolean }>(`/me/favourites/${productId}`, { method: 'DELETE' }),
}

/** The signed-in shopper's hearts, and a toggle that updates them at once. */
export function useFavourites() {
  const session = useSession((s) => s.session)
  const qc = useQueryClient()
  const ids = useQuery({ queryKey: ['favourite-ids'], queryFn: favouriteApi.ids, enabled: !!session, staleTime: 60_000 })
  const set = new Set(ids.data ?? [])
  const toggle = useMutation({
    mutationFn: (productId: number) => (set.has(productId) ? favouriteApi.remove(productId) : favouriteApi.add(productId)),
    onMutate: (productId) => {
      const prev = qc.getQueryData<number[]>(['favourite-ids']) ?? []
      qc.setQueryData(['favourite-ids'], prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId])
      return { prev }
    },
    onError: (_e, _id, ctx) => ctx && qc.setQueryData(['favourite-ids'], ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favourite-ids'] })
      qc.invalidateQueries({ queryKey: ['favourites'] })
    },
  })
  return { signedIn: !!session, has: (id: number) => set.has(id), toggle: (id: number) => toggle.mutate(id) }
}
