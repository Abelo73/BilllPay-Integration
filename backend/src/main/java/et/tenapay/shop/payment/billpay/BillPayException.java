package et.tenapay.shop.payment.billpay;

import lombok.Getter;

@Getter
public class BillPayException extends RuntimeException {

	/** HTTP status from BillPay, or 0 when the call never got a response. */
	private final int httpStatus;
	private final String responseBody;

	public BillPayException(int httpStatus, String responseBody, String message, Throwable cause) {
		super(message, cause);
		this.httpStatus = httpStatus;
		this.responseBody = responseBody;
	}

	public boolean isNetworkError() {
		return httpStatus == 0;
	}
}
