-- Reviews from verified buyers (Sodo Gebeya M12): one per bought item, only after the order was delivered.
CREATE TABLE reviews (
    id             BIGSERIAL PRIMARY KEY,
    order_id       UUID         NOT NULL REFERENCES orders (id),
    order_item_id  BIGINT       NOT NULL UNIQUE REFERENCES order_items (id),
    product_id     BIGINT       NOT NULL REFERENCES products (id),
    shop_id        BIGINT       REFERENCES shops (id),       -- null: sold by Sodo Gebeya itself
    author_id      UUID         NOT NULL REFERENCES users (id),
    author_name    VARCHAR(80)  NOT NULL,                     -- shown as "Hana G."
    rating         SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body           VARCHAR(1000),
    seller_reply   VARCHAR(1000),
    replied_at     TIMESTAMPTZ,
    hidden         BOOLEAN      NOT NULL DEFAULT FALSE,       -- staff moderation; hidden reviews don't count
    hidden_reason  VARCHAR(300),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_product ON reviews (product_id, created_at DESC) WHERE NOT hidden;
CREATE INDEX idx_reviews_shop ON reviews (shop_id, created_at DESC) WHERE NOT hidden;
CREATE INDEX idx_reviews_author ON reviews (author_id);
