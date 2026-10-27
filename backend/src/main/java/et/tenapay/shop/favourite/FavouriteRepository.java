package et.tenapay.shop.favourite;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FavouriteRepository extends JpaRepository<Favourite, Long> {

	List<Favourite> findByUserIdOrderByCreatedAtDesc(UUID userId);

	Optional<Favourite> findByUserIdAndProductId(UUID userId, Long productId);

	List<Favourite> findByProductId(Long productId);

	long countByUserId(UUID userId);

	long countByProductId(Long productId);

	@Modifying
	@Query("delete from Favourite f where f.userId = :userId and f.productId = :productId")
	int remove(@Param("userId") UUID userId, @Param("productId") Long productId);
}
