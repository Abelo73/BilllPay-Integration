package et.tenapay.shop.inbox;

import java.util.UUID;

/** Published once for each new notification, so other channels (Telegram) can pass it on. */
public record InboxItemAdded(UUID userId, InboxItem.Kind kind, String title, String body, String link) {
}
