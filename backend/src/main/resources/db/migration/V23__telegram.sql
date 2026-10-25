-- Telegram bot (Sodo Gebeya M20): who gets alerts in which chat, one-time link codes, listings already posted to the channel.
CREATE TABLE telegram_links (
    user_id     UUID          PRIMARY KEY REFERENCES users (id),
    chat_id     BIGINT        NOT NULL UNIQUE,
    username    VARCHAR(64),
    linked_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE telegram_link_codes (
    code        VARCHAR(32)   PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES users (id),
    expires_at  TIMESTAMPTZ   NOT NULL
);
CREATE INDEX idx_telegram_link_codes_user ON telegram_link_codes (user_id);

CREATE TABLE telegram_channel_posts (
    product_id  BIGINT        PRIMARY KEY REFERENCES products (id),
    posted_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
