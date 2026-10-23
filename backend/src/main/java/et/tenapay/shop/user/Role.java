package et.tenapay.shop.user;

public enum Role {
	/** Shopper: signs in on the store. */
	CUSTOMER,
	/** Staff, read-only admin access. */
	SUPPORT,
	/** Staff, full admin access including refunds and user management. */
	ADMIN;

	public boolean isStaff() {
		return this != CUSTOMER;
	}
}
