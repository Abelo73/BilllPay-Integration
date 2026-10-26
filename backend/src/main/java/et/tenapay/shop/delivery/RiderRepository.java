package et.tenapay.shop.delivery;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RiderRepository extends JpaRepository<Rider, Long> {

	List<Rider> findAllByOrderByActiveDescNameAsc();
}
