-- Sodo Gebeya M4: seller verification, richer listings (condition, negotiable, area), areas of Sodo, listing reports.

-- A seller sends ID photos; staff check them and give the Verified badge. Photos are stored privately
-- (keys under private/, never served by /api/media) and shown only to staff and to the seller.
CREATE TABLE verifications (
    id            BIGSERIAL PRIMARY KEY,
    shop_id       BIGINT       NOT NULL REFERENCES shops (id),
    id_type       VARCHAR(20)  NOT NULL DEFAULT 'FAYDA',   -- FAYDA, KEBELE, PASSPORT, DRIVING_LICENCE
    id_front_key  VARCHAR(300),
    id_back_key   VARCHAR(300),
    selfie_key    VARCHAR(300),
    licence_key   VARCHAR(300),                             -- trade licence photo, optional
    details       VARCHAR(1000),                            -- seller's note: licence number, shop location, skills
    status        VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',    -- DRAFT, SUBMITTED, APPROVED, MORE_INFO, REJECTED
    staff_note    VARCHAR(500),                             -- what to fix, shown to the seller
    submitted_at  TIMESTAMPTZ,
    decided_at    TIMESTAMPTZ,
    decided_by    VARCHAR(200),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    version       INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_verifications_shop ON verifications (shop_id, id);
CREATE INDEX idx_verifications_status ON verifications (status, submitted_at);

ALTER TABLE shops ADD COLUMN verified_at TIMESTAMPTZ;

-- Listing details from the "post a listing" screen. NULL condition = new goods from a shop.
ALTER TABLE products ADD COLUMN item_condition VARCHAR(20);   -- NEW, LIKE_NEW, USED
ALTER TABLE products ADD COLUMN negotiable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN area VARCHAR(120);            -- where the item is; NULL = the shop's area
-- Set when staff take a listing down after reports; the seller can't show it again until staff lift it.
ALTER TABLE products ADD COLUMN blocked_reason VARCHAR(500);

-- Areas of Sodo offered in forms and filters, managed by staff in the admin. Typing another area still works.
CREATE TABLE areas (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL UNIQUE,
    sort_order  INT          NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Starting list from the design; staff add the real neighbourhoods in Admin -> Areas.
INSERT INTO areas (name, sort_order) VALUES
    ('Arada', 1), ('Merkato area', 2), ('Bus station', 3), ('University area', 4), ('All of Sodo town', 5);

-- Shoppers report a listing; staff hide it or dismiss the report. One report per person per listing.
CREATE TABLE listing_reports (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT       NOT NULL REFERENCES products (id),
    reporter_id  UUID         NOT NULL REFERENCES users (id),
    reason       VARCHAR(40)  NOT NULL,   -- SCAM, FAKE, PROHIBITED, WRONG_INFO, OFFENSIVE, OTHER
    details      VARCHAR(1000),
    status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN',   -- OPEN, HIDDEN (listing hidden), DISMISSED
    decided_at   TIMESTAMPTZ,
    decided_by   VARCHAR(200),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (product_id, reporter_id)
);
CREATE INDEX idx_listing_reports_status ON listing_reports (status, created_at);
