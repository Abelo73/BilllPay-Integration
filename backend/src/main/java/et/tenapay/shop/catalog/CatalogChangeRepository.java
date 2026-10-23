package et.tenapay.shop.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogChangeRepository extends JpaRepository<CatalogChange, Long> {

	Page<CatalogChange> findByEntityTypeAndEntityId(CatalogChange.EntityType type, Long entityId, Pageable pageable);
}
