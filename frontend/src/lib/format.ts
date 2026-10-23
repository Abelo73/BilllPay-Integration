const etb = new Intl.NumberFormat('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatETB(amount: number) {
  return `ETB ${etb.format(amount)}`
}

/** Shopper-friendly text for BillPay reason codes (see docs/BILLPAY_INTEGRATION.md §5). */
export function reasonMessage(code: string | null | undefined) {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return 'There was not enough balance to complete the payment.'
    case 'CUSTOMER_DECLINED':
      return 'The payment was declined.'
    case 'ACCOUNT_BLOCKED':
      return 'The paying account is blocked. Try another payment method.'
    case 'LIMIT_EXCEEDED':
      return 'The payment is over your account limit.'
    case 'CARD_EXPIRED':
      return 'The card has expired. Try another card or method.'
    case 'PROVIDER_TIMEOUT':
      return 'The payment request was never approved, so it timed out.'
    default:
      return code ? `The payment did not go through (${code}).` : 'The payment did not go through.'
  }
}

/** Remembers the phone for each order so the return page can look it up without asking. */
export const orderContact = {
  save(orderNumber: string, phone: string) {
    try {
      sessionStorage.setItem(`order:${orderNumber}`, phone)
    } catch {
      /* storage unavailable: the return page will ask for the phone */
    }
  },
  phone(orderNumber: string) {
    try {
      return sessionStorage.getItem(`order:${orderNumber}`)
    } catch {
      return null
    }
  },
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
