package et.tenapay.shop.common;

import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import et.tenapay.shop.payment.billpay.BillPayException;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(ApiException.class)
	ProblemDetail handleApi(ApiException ex) {
		ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
		pd.setProperty("code", ex.getCode());
		ex.getDetails().forEach(pd::setProperty);
		return pd;
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
		ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
		pd.setProperty("code", "VALIDATION_FAILED");
		pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
				.collect(Collectors.toMap(e -> e.getField(), e -> String.valueOf(e.getDefaultMessage()), (a, b) -> a)));
		return pd;
	}

	@ExceptionHandler(BillPayException.class)
	ProblemDetail handleBillPay(BillPayException ex) {
		log.error("BillPay call failed: {}", ex.getMessage());
		ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY,
				"The payment provider could not be reached. Please try again in a moment.");
		pd.setProperty("code", "PAYMENT_PROVIDER_ERROR");
		return pd;
	}
}
