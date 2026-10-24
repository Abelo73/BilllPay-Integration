package et.tenapay.shop.user;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findByEmail(String email);

	boolean existsByEmail(String email);

	long countByRoleAndEnabledTrue(Role role);

	java.util.List<User> findByRoleAndEnabledTrue(Role role);

	@Query("""
			select u from User u
			where u.role in :roles
			  and (:q is null or lower(u.email) like lower(concat('%', cast(:q as string), '%'))
			       or lower(u.fullName) like lower(concat('%', cast(:q as string), '%')))
			""")
	Page<User> search(@Param("roles") Collection<Role> roles, @Param("q") String q, Pageable pageable);
}
