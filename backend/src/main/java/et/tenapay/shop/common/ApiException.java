package et.tenapay.shop.common;

import java.util.Map;

import org.springframework.http.HttpStatus;

import lombok.Getter;

/** Error that maps straight to an RFC 7807 problem response. */
@Getter
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;
	private final Map<String, Object> details;

	public ApiException(HttpStatus status, String code, String message) {
		this(status, code, message, Map.of());
	}

	public ApiException(HttpStatus status, String code, String message, Map<String, Object> details) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}

	public static ApiException notFound(String what) {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
	}
}
