package et.tenapay.shop.order;

import java.util.EnumSet;
import java.util.Set;

/** Delivery progress of a paid order. Payment status lives on {@link OrderStatus}; this only moves forward. */
public enum FulfilmentStatus {
	UNFULFILLED,
	PROCESSING,
	SHIPPED,
	DELIVERED,
	CANCELLED;

	/** Allowed next steps: forward one or more steps, or cancel before it ships. */
	public Set<FulfilmentStatus> next() {
		return switch (this) {
			case UNFULFILLED -> EnumSet.of(PROCESSING, SHIPPED, CANCELLED);
			case PROCESSING -> EnumSet.of(SHIPPED, CANCELLED);
			case SHIPPED -> EnumSet.of(DELIVERED);
			case DELIVERED, CANCELLED -> EnumSet.noneOf(FulfilmentStatus.class);
		};
	}
}
