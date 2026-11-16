-- Shop photo gallery: up to six photos of the shop, its stock and its front, shown on the public shop page.
CREATE TABLE shop_photos (
    id          BIGSERIAL PRIMARY KEY,
    shop_id     BIGINT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    position    INT NOT NULL,
    image_key   VARCHAR(300) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_photos_shop ON shop_photos (shop_id, position);
