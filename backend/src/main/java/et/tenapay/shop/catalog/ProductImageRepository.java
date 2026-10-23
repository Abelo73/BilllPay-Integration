package et.tenapay.shop.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

	List<ProductImage> findByProductIdOrderByPositionAsc(Long productId);

	long countByProductId(Long productId);
}
