-- Jiji-style buying (online payment off by default): signed-in buyers reveal a seller's phone to call or message them.
-- Each reveal is counted, so sellers see how many people asked about a listing (and abuse can be spotted).
CREATE TABLE contact_reveals (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT      NOT NULL REFERENCES products (id),
    shop_id     BIGINT      REFERENCES shops (id),     -- NULL = a Sodo Gebeya item
    user_id     UUID        NOT NULL REFERENCES users (id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_reveals_shop ON contact_reveals (shop_id, created_at);
CREATE INDEX idx_contact_reveals_user ON contact_reveals (user_id, created_at);
