import { useQuery } from '@tanstack/react-query'

import { request } from '@/lib/api'

/** The store's switches and prices (Admin → Features). Values come as strings: "true"/"false", numbers, text. */
export type FeatureMap = Record<string, string>

/** Used until the real values arrive: the safest choice (online payment off). */
const FALLBACK: FeatureMap = { online_payments: 'false', show_seller_phone: 'true' }

export const featuresApi = {
  get: () => request<FeatureMap>('/features'),
}

export function useFeatures() {
  const { data } = useQuery({ queryKey: ['features'], queryFn: featuresApi.get, staleTime: 60_000 })
  const all = data ?? FALLBACK
  return {
    loaded: !!data,
    on: (key: string) => all[key] === 'true',
    number: (key: string) => Number(all[key] ?? 0),
    text: (key: string) => all[key] ?? '',
    /** Cart, checkout and online payment (BillPay). Off: buyers contact the seller instead (Jiji-style). */
    payments: all.online_payments === 'true',
  }
}
