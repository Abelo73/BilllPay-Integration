package et.tenapay.shop.promo;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BannerAdRepository extends JpaRepository<BannerAd, Long> {

	List<BannerAd> findAllByOrderByPositionAscIdDesc();
}
