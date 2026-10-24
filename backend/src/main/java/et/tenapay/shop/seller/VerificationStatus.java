package et.tenapay.shop.seller;

public enum VerificationStatus {
	/** Photos being added; not sent yet. */
	DRAFT,
	/** Sent; waiting for staff. */
	SUBMITTED,
	/** Checked; the shop has the Verified badge. */
	APPROVED,
	/** Staff asked for a clearer or missing photo; the seller fixes it and sends again. */
	MORE_INFO,
	/** Not accepted (for example the ID doesn't match the person). */
	REJECTED;

	public boolean editable() {
		return this == DRAFT || this == MORE_INFO;
	}
}
