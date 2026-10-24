-- Order-update SMS are triggered by Kafka events, which can be delivered twice. A unique key per event makes the
-- second delivery a no-op, so a customer (and our SMS bill) never gets the same text twice.
ALTER TABLE sms_messages ADD COLUMN dedupe_key VARCHAR(160);
CREATE UNIQUE INDEX ux_sms_messages_dedupe ON sms_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;
