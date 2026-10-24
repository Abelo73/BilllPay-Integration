-- In-app notifications (design S15) and per-person SMS choices (Sodo Gebeya M11).
CREATE TABLE inbox_items (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES users (id),
    kind        VARCHAR(20)   NOT NULL,      -- ORDER, PAYMENT, DELIVERY, CHAT, JOB, SHOP, REVIEW, SYSTEM
    title       VARCHAR(160)  NOT NULL,
    body        VARCHAR(500),
    link        VARCHAR(300),                -- a path inside the shop
    dedupe_key  VARCHAR(200)  UNIQUE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbox_user ON inbox_items (user_id, created_at DESC);
CREATE INDEX idx_inbox_unread ON inbox_items (user_id) WHERE read_at IS NULL;

-- No row = every SMS topic on.
CREATE TABLE notification_prefs (
    user_id     UUID         PRIMARY KEY REFERENCES users (id),
    sms_orders  BOOLEAN      NOT NULL DEFAULT TRUE,
    sms_chat    BOOLEAN      NOT NULL DEFAULT TRUE,
    sms_jobs    BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
