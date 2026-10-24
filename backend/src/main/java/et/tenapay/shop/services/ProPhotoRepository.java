package et.tenapay.shop.services;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface ProPhotoRepository extends JpaRepository<ProPhoto, Long> {

	List<ProPhoto> findByProIdOrderByPositionAsc(Long proId);

	long countByProId(Long proId);
}
