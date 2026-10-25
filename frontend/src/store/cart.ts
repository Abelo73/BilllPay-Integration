import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { Product } from '@/lib/api'

export type CartLine = {
  productId: number
  slug: string
  name: string
  price: number
  categorySlug: string
  imageUrl: string | null
  quantity: number
  /** Who sells it (null or missing = Sodo Gebeya); the cart is grouped by seller */
  seller?: { name: string; slug: string } | null
}

type CartState = {
  lines: CartLine[]
  open: boolean
  setOpen: (open: boolean) => void
  add: (product: Product, quantity?: number) => void
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
}

export const MAX_QTY = 20

/** Client-side cart; prices here are for display only — the server recomputes them at checkout. */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      open: false,
      setOpen: (open) => set({ open }),
      add: (product, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === product.id)
          const lines = existing
            ? s.lines.map((l) =>
                l.productId === product.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l,
              )
            : [
                ...s.lines,
                {
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  categorySlug: product.categorySlug,
                  imageUrl: product.imageUrl,
                  quantity,
                  seller: product.seller ? { name: product.seller.name, slug: product.seller.slug } : null,
                },
              ]
          return { lines, open: true }
        }),
      setQuantity: (productId, quantity) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, quantity: Math.max(1, Math.min(MAX_QTY, quantity)) } : l,
          ),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'tenashop-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
)

export const cartTotals = (lines: CartLine[]) => ({
  count: lines.reduce((n, l) => n + l.quantity, 0),
  subtotal: lines.reduce((n, l) => n + l.price * l.quantity, 0),
})
