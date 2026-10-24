package et.tenapay.shop.inbox;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface NotificationPrefsRepository extends JpaRepository<NotificationPrefs, UUID> {
}
