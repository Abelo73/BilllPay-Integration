-- Replies (quote another message in the same chat) and voice messages (a short recording, up to 2 minutes).
ALTER TABLE chat_messages ADD COLUMN reply_to_id BIGINT REFERENCES chat_messages (id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN audio_key VARCHAR(200);
ALTER TABLE chat_messages ADD COLUMN audio_seconds INT CHECK (audio_seconds BETWEEN 1 AND 120);
CREATE INDEX idx_chat_messages_reply ON chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
