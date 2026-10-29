import { request } from '@/lib/api'

/** The buyer's receipt (after payment) and detailed delivery tracking. */

export type Receipt = {
  receiptNumber: string
  orderNumber: string
  status: string
  orderedAt: string
  paidAt: string | null
  customerName: string
  /** masked, e.g. +251 ****** 344 */
  customerPhone: string | null
  customerEmail: string | null
  deliveryAddress: string | null
  deliveryArea: string | null
  lines: { name: string; quantity: number; unitPrice: number; lineTotal: number; seller: string }[]
  subtotal: number
  discountCode: string | null
  discountAmount: number
  deliveryFee: number
  total: number
  currency: string
  paymentMethod: 'BILLPAY' | 'CASH'
  /** How the buyer paid inside BillPay (TELEBIRR, BILLBANK, …) */
  paidWith: string | null
  billpayPaymentId: string | null
  paymentReference: string | null
  environment: 'SANDBOX' | 'LIVE'
  refunds: { amount: number; status: string; at: string }[]
  refundedTotal: number
  netPaid: number
}

export type MapPoint = { label: string; lat: number; lng: number; exact: boolean }

export type TrackStepKey =
  | 'ORDERED' | 'PAID' | 'PAY_AT_DOOR' | 'PACKING' | 'RIDER_ASSIGNED' | 'ON_THE_WAY' | 'CASH_PAID' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'

export type TrackStep = { key: TrackStepKey; at: string | null; place: string | null; detail: string | null }

export type ParcelTracking = {
  parcelNo: number
  number: string
  seller: string
  fulfilmentStatus: 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | null
  from: MapPoint
  to: MapPoint
  steps: TrackStep[]
  riderName: string | null
  riderPhone: string | null
  trackingNote: string | null
}

export type Tracking = {
  orderNumber: string
  status: string
  paymentMethod: 'BILLPAY' | 'CASH'
  deliveryAddress: string | null
  deliveryArea: string | null
  parcels: ParcelTracking[]
}

const q = (phone: string) => (phone ? `?phone=${encodeURIComponent(phone)}` : '')

export const orderExtrasApi = {
  receipt: (orderNumber: string, phone: string) =>
    request<Receipt>(`/orders/${encodeURIComponent(orderNumber)}/receipt${q(phone)}`),
  tracking: (orderNumber: string, phone: string) =>
    request<Tracking>(`/orders/${encodeURIComponent(orderNumber)}/tracking${q(phone)}`),
}
