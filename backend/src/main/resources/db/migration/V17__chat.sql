-- Chat between a buyer and a shop, with offers (Sodo Gebeya M10).

-- One conversation per buyer and shop; product_id is the item it is currently about (shown as a card on top).
CREATE TABLE conversations (
    id                    BIGSERIAL PRIMARY KEY,
    buyer_id              UUID        NOT NULL REFERENCES users (id),
    shop_id               BIGINT      NOT NULL REFERENCES shops (id),
    product_id            BIGINT      REFERENCES products (id),
    last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_preview  VARCHAR(160),
    buyer_last_read_at    TIMESTAMPTZ,
    seller_last_read_at   TIMESTAMPTZ,
    blocked_by            VARCHAR(10),               -- BUYER or SELLER: the other side can no longer write
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (buyer_id, shop_id)
);
CREATE INDEX idx_conversations_buyer ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX idx_conversations_shop ON conversations (shop_id, last_message_at DESC);

-- An offer: a price for a product and quantity, made by either side; accepting it lets the buyer check out at that price.
CREATE TABLE chat_offers (
    id                 BIGSERIAL PRIMARY KEY,
    conversation_id    BIGINT        NOT NULL REFERENCES conversations (id),
    product_id         BIGINT        NOT NULL REFERENCES products (id),
    quantity           INT           NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    unit_price         NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),
    made_by            VARCHAR(10)   NOT NULL,       -- BUYER or SELLER
    status             VARCHAR(20)   NOT NULL,       -- PENDING, ACCEPTED, DECLINED, COUNTERED, WITHDRAWN, EXPIRED, USED
    expires_at         TIMESTAMPTZ   NOT NULL,       -- pending offers lapse; accepted ones must be bought before this
    decided_at         TIMESTAMPTZ,
    used_order_number  VARCHAR(40),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_offers_conversation ON chat_offers (conversation_id, created_at);

CREATE TABLE chat_messages (
    id               BIGSERIAL PRIMARY KEY,
    conversation_id  BIGINT       NOT NULL REFERENCES conversations (id),
    sender_id        UUID         REFERENCES users (id),   -- null for system notes
    sender_role      VARCHAR(10)  NOT NULL,                 -- BUYER, SELLER, SYSTEM
    kind             VARCHAR(10)  NOT NULL,                 -- TEXT, IMAGE, OFFER, SYSTEM
    body             VARCHAR(2000),
    image_key        VARCHAR(300),
    offer_id         BIGINT       REFERENCES chat_offers (id),
    -- looks like an attempt to deal off the platform (phone number, "send money first", ...): shown with a warning
    flagged          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_conversation ON chat_messages (conversation_id, id);

-- A person reports a conversation; staff can read reported conversations only.
CREATE TABLE chat_reports (
    id               BIGSERIAL PRIMARY KEY,
    conversation_id  BIGINT       NOT NULL REFERENCES conversations (id),
    reporter_id      UUID         NOT NULL REFERENCES users (id),
    reason           VARCHAR(40)  NOT NULL,          -- SCAM, OFF_PLATFORM_PAYMENT, ABUSE, SPAM, OTHER
    details          VARCHAR(500),
    status           VARCHAR(20)  NOT NULL DEFAULT 'OPEN',   -- OPEN, RESOLVED
    resolution       VARCHAR(500),
    resolved_by      VARCHAR(200),
    resolved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_reports_status ON chat_reports (status, created_at);
