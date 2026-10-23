-- Phase 2 P4: emails sent to customers (one row per email; the unique key stops Kafka re-deliveries
-- from sending the same email twice)
CREATE TABLE notifications (
    id         BIGSERIAL PRIMARY KEY,
    kind       VARCHAR(40)  NOT NULL,
    dedupe_key VARCHAR(160) NOT NULL UNIQUE,
    order_number VARCHAR(40),
    recipient  VARCHAR(200) NOT NULL,
    subject    VARCHAR(300) NOT NULL,
    status     VARCHAR(20)  NOT NULL,
    error      TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at    TIMESTAMPTZ
);

CREATE INDEX idx_notifications_created ON notifications (created_at DESC);
CREATE INDEX idx_notifications_order ON notifications (order_number);
