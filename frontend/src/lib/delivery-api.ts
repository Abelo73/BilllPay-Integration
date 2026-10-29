import { staffRequest } from '@/lib/chat-admin-api'
import type { AreaRow } from '@/lib/trust-api'

/** M21: delivery fee per area of Sodo, partner riders, a rider per parcel (staff side). */

/** deliveryFee null = the standard fee, 0 = free. */
export type AreaFeeRow = AreaRow & { deliveryFee: number | null; lat?: number | null; lng?: number | null }

export type RiderRow = { id: number; name: string; phone: string; note: string | null; active: boolean }

export type RiderInput = { name?: string; phone?: string; note?: string; active?: boolean }

const json = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) })

export const deliveryAdminApi = {
  areas: () => staffRequest<AreaFeeRow[]>('/areas'),
  setAreaFee: (id: number, fee: number | null) => staffRequest<AreaFeeRow[]>(`/areas/${id}/delivery-fee`, json('PUT', { fee })),
  /** Map point for order tracking; both null = the centre of Sodo */
  setAreaPoint: (id: number, lat: number | null, lng: number | null) => staffRequest<AreaFeeRow[]>(`/areas/${id}/point`, json('PUT', { lat, lng })),
  riders: () => staffRequest<RiderRow[]>('/riders'),
  addRider: (r: RiderInput) => staffRequest<RiderRow>('/riders', json('POST', r)),
  updateRider: (id: number, r: RiderInput) => staffRequest<RiderRow>(`/riders/${id}`, json('PATCH', r)),
  /** riderId null takes the rider off the parcel */
  assign: (orderNumber: string, parcelNo: number, riderId: number | null) =>
    staffRequest<unknown>(`/orders/${encodeURIComponent(orderNumber)}/parcels/${parcelNo}/rider`, json('PUT', { riderId })),
}
