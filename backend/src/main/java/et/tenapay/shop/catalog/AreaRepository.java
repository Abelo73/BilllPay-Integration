package et.tenapay.shop.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AreaRepository extends JpaRepository<Area, Long> {

	List<Area> findAllByOrderBySortOrderAscIdAsc();

	List<Area> findByActiveTrueOrderBySortOrderAscIdAsc();

	boolean existsByNameIgnoreCase(String name);

	@Query("select coalesce(max(a.sortOrder), 0) from Area a")
	int maxSortOrder();
}
