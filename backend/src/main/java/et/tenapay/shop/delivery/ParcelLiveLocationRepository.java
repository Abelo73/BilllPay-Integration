package et.tenapay.shop.delivery;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ParcelLiveLocationRepository extends JpaRepository<ParcelLiveLocation, Long> {

	@Modifying
	@Query("delete from ParcelLiveLocation l where l.updatedAt < :before")
	int deleteOlderThan(@Param("before") Instant before);
}
