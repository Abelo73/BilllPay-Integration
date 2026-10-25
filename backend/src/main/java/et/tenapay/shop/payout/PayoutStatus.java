package et.tenapay.shop.payout;

public enum PayoutStatus {
	/** The seller asked for it; staff haven't sent it yet. */
	REQUESTED,
	/** Staff sent the money and recorded the transfer reference. */
	PAID,
	/** Not sent (wrong account details, ...); the amount is available again. */
	REJECTED
}
