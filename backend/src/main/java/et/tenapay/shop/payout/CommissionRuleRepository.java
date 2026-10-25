package et.tenapay.shop.payout;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommissionRuleRepository extends JpaRepository<CommissionRule, Long> {

	/** Rules that could apply to this seller and category (the default rule included). */
	@Query("""
			select r from CommissionRule r
			where (r.shopId is null or r.shopId = :shopId) and (r.categoryId is null or r.categoryId = :categoryId)
			""")
	List<CommissionRule> candidates(@Param("shopId") Long shopId, @Param("categoryId") Long categoryId);

	@Query("""
			select r from CommissionRule r
			where ((:shopId is null and r.shopId is null) or r.shopId = :shopId)
			  and ((:categoryId is null and r.categoryId is null) or r.categoryId = :categoryId)
			""")
	java.util.Optional<CommissionRule> findScope(@Param("shopId") Long shopId, @Param("categoryId") Long categoryId);

	List<CommissionRule> findAllByOrderByIdAsc();
}
