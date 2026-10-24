package et.tenapay.shop.services;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface JobPhotoRepository extends JpaRepository<JobPhoto, Long> {

	List<JobPhoto> findByJobIdOrderByIdAsc(Long jobId);

	long countByJobId(Long jobId);
}
