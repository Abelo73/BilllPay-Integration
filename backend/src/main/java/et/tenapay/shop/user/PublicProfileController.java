package et.tenapay.shop.user;

import java.time.Instant;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import et.tenapay.shop.common.ApiException;

/**
 * The public profile. Shows the first name, the picture, the bio, the area and the join month, and nothing else:
 * no phone, no email, no surname. A profile that is off answers 404, the same as a profile that does not exist.
 */
@RestController
public class PublicProfileController {

	private final UserRepository users;

	public PublicProfileController(UserRepository users) {
		this.users = users;
	}

	public record PublicProfile(UUID id, String firstName, String avatarUrl, String bio, String area, Instant joinedAt) {
	}

	@GetMapping("/api/people/{id}")
	@Transactional(readOnly = true)
	public PublicProfile view(@PathVariable UUID id) {
		User u = users.findById(id).filter(User::isProfilePublic).orElseThrow(() -> ApiException.notFound("Profile"));
		String first = u.getFullName() == null || u.getFullName().isBlank() ? "" : u.getFullName().trim().split("\\s+")[0];
		return new PublicProfile(u.getId(), first, u.getAvatarKey() == null ? null : "/api/media/" + u.getAvatarKey(),
				u.getBio(), u.getArea(), u.getCreatedAt());
	}
}
