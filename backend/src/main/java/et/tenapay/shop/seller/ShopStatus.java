package et.tenapay.shop.seller;

public enum ShopStatus {
	/** Waiting for staff; the seller can already add products, but nothing shows in the store. */
	PENDING,
	/** Products show in the store and can be bought. */
	APPROVED,
	/** Not accepted; the seller can fix the details and send it again. */
	REJECTED,
	/** Taken off the store by staff; products are hidden and can't be bought. */
	SUSPENDED;

	public boolean selling() {
		return this == APPROVED;
	}
}
