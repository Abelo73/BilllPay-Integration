package et.tenapay.shop.common;

import java.util.List;

import org.springframework.data.domain.Page;

/** Stable JSON shape for paged responses. */
public record PageDto<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

	public static <T> PageDto<T> of(Page<T> page) {
		return new PageDto<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
				page.getTotalPages());
	}
}
