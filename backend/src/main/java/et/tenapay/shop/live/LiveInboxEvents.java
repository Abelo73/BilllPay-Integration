package et.tenapay.shop.live;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import et.tenapay.shop.inbox.InboxItemAdded;
import lombok.RequiredArgsConstructor;

/** A new notification tells the person's open apps to refresh the bell. Sent only after the notification is saved. */
@Component
@RequiredArgsConstructor
public class LiveInboxEvents {

	private final LiveHub hub;

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
	public void onInbox(InboxItemAdded item) {
		hub.publish(item.userId(), "inbox", "{}");
	}
}
