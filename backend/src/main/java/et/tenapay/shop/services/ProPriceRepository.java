package et.tenapay.shop.services;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ProPriceRepository extends JpaRepository<ProPrice, Long> {

	List<ProPrice> findByProIdOrderByPositionAsc(Long proId);

	@Modifying
	@Query("delete from ProPrice p where p.proId = :proId")
	void deleteByProId(@Param("proId") Long proId);
}
