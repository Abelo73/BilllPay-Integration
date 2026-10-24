-- Many sellers (Sodo Gebeya M3). A customer account opens one shop (a business) or a seller page (a person
-- selling a few things). Staff approve it before its products show in the store.

CREATE TABLE shops (
    id            BIGSERIAL PRIMARY KEY,
    owner_id      UUID         NOT NULL UNIQUE REFERENCES users (id),
    kind          VARCHAR(20)  NOT NULL,                 -- SHOP, INDIVIDUAL
    name          VARCHAR(120) NOT NULL,
    slug          VARCHAR(140) NOT NULL UNIQUE,
    description   VARCHAR(2000),
    phone         VARCHAR(20),
    area          VARCHAR(120),                          -- neighbourhood in Sodo, e.g. "Arada" or "University area"
    address_line  VARCHAR(200),
    logo_key      VARCHAR(300),
    cover_key     VARCHAR(300),
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, SUSPENDED
    status_note   VARCHAR(500),                          -- why it was rejected or suspended, shown to the seller
    decided_at    TIMESTAMPTZ,
    decided_by    VARCHAR(200),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    version       INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_shops_status ON shops (status, created_at);

-- Who sells each product. NULL = sold by Sodo Gebeya itself (every product that existed before M3).
ALTER TABLE products ADD COLUMN shop_id BIGINT REFERENCES shops (id);
CREATE INDEX idx_products_shop ON products (shop_id);

-- Which shop each bought line belongs to, copied at checkout so a seller sees only their own lines.
ALTER TABLE order_items ADD COLUMN shop_id BIGINT REFERENCES shops (id);
CREATE INDEX idx_order_items_shop ON order_items (shop_id);
