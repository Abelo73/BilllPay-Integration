package et.tenapay.shop.payout;

/** A seller parcel's money. */
public enum EarningStatus {
	/** Paid by the buyer, held by Sodo Gebeya until delivery is confirmed. */
	HELD,
	/** The seller can withdraw it. */
	RELEASED,
	/** The parcel was cancelled; the buyer gets the money back. */
	CANCELLED
}
