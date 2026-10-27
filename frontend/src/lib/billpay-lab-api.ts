import { staffRequest } from '@/lib/chat-admin-api'

/** Admin → BillPay lab: test payments straight against BillPay, with every call and webhook kept. */

export type LabRun = {
  id: string
  environment: 'SANDBOX' | 'LIVE'
  merchantReference: string
  billpayPaymentId: string | null
  amount: number
  description: string | null
  /** BillPay's last word: CREATED, PROCESSING, CAPTURED, … (CREATE_FAILED = BillPay refused to create it) */
  status: string | null
  checkoutUrl: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string | null
}

export type LabCall = {
  id: number
  operation: 'create_payment' | 'get_payment' | 'create_refund' | string
  /** null = no answer (network error) */
  httpStatus: number | null
  durationMs: number
  request: string | null
  response: string | null
  error: string | null
  at: string
}

export type LabHook = {
  eventType: string | null
  status: string | null
  signatureValid: boolean | null
  signatureScheme: string | null
  note: string | null
  receivedAt: string | null
  /** Seconds between creating the payment and this webhook arriving */
  secondsAfterCreate: number | null
  payload: string | null
}

export type LabDetail = { run: LabRun; calls: LabCall[]; webhooks: LabHook[] }

export type LabCreate = {
  environment: 'SANDBOX' | 'LIVE'
  amount: number
  description?: string
  customerName?: string
  customerPhone?: string
  confirmLive?: boolean
}

const json = (b: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(b) })

export const labApi = {
  list: () => staffRequest<LabRun[]>('/billpay-lab'),
  detail: (id: string) => staffRequest<LabDetail>(`/billpay-lab/${id}`),
  create: (b: LabCreate) => staffRequest<LabDetail>('/billpay-lab', json(b)),
  refresh: (id: string) => staffRequest<LabDetail>(`/billpay-lab/${id}/refresh`, json({})),
  refund: (id: string, amount: number, reason?: string) => staffRequest<LabDetail>(`/billpay-lab/${id}/refund`, json({ amount, reason })),
}
