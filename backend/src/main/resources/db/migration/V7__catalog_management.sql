-- Catalog management: category order/visibility, low-stock threshold, product photos, change history.

ALTER TABLE categories
    ADD COLUMN sort_order INT NOT NULL DEFAULT 0,
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE categories SET sort_order = id;

ALTER TABLE products
    ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);

-- Up to 5 photos per product; position 0 is the main photo. Objects live in S3-compatible storage.
CREATE TABLE product_images (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products (id),
    position    INT NOT NULL,
    large_key   VARCHAR(300) NOT NULL,     -- ≤ 1200 px, shown on the product page
    thumb_key   VARCHAR(300) NOT NULL,     -- 400 px square, used in lists and carts
    width       INT,
    height      INT,
    size_bytes  INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images_product ON product_images (product_id, position);

-- Who changed what in the catalog: "price 650.00 → 700.00", "stock +10 (restock)", ...
CREATE TABLE catalog_changes (
    id          BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,      -- PRODUCT or CATEGORY
    entity_id   BIGINT NOT NULL,
    action      VARCHAR(30) NOT NULL,
    detail      TEXT,
    user_id     UUID,
    user_email  VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_changes_entity ON catalog_changes (entity_type, entity_id, created_at);
CREATE INDEX idx_catalog_changes_created ON catalog_changes (created_at);
