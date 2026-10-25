-- Sodo Gebeya M6: protected payments, commission and payouts to sellers.
-- The buyer's money is held by the platform; each seller parcel records what the seller earns (locked when the order
-- is paid) and becomes available once the buyer confirms receipt or 48 h after delivery. Sellers ask for payouts;
-- staff send them (bank or wallet transfer for now) and record the reference.

-- Commission rules: the most specific wins (seller + category > seller > category > default).
CREATE TABLE commission_rules (
    id           BIGSERIAL PRIMARY KEY,
    shop_id      BIGINT       REFERENCES shops (id),
    category_id  BIGINT       REFERENCES categories (id),
    percent      NUMERIC(5, 2) NOT NULL CHECK (percent >= 0 AND percent <= 50),
    note         VARCHAR(200),
    updated_by   VARCHAR(200),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_commission_rules_scope ON commission_rules (COALESCE(shop_id, 0), COALESCE(category_id, 0));
-- Launch default: no commission (change it in Admin -> Fees).
INSERT INTO commission_rules (shop_id, category_id, percent, note, updated_by) VALUES (NULL, NULL, 0, 'Launch default', 'system');

-- What each seller parcel earns. Sodo Gebeya's own parcels (shop_id NULL) have no payout.
ALTER TABLE order_parcels
    ADD COLUMN payout_status      VARCHAR(20),               -- HELD, RELEASED, CANCELLED; NULL = unpaid or our own parcel
    ADD COLUMN commission_percent NUMERIC(5, 2),
    ADD COLUMN commission_amount  NUMERIC(12, 2),
    ADD COLUMN seller_amount      NUMERIC(12, 2),            -- items + delivery fee - commission
    ADD COLUMN received_at        TIMESTAMPTZ,               -- buyer tapped "I received my items"
    ADD COLUMN released_at        TIMESTAMPTZ;
CREATE INDEX idx_order_parcels_payout ON order_parcels (shop_id, payout_status);

-- Where a seller wants their money.
ALTER TABLE shops
    ADD COLUMN payout_method       VARCHAR(20),               -- BANK, TELEBIRR, CBE_BIRR, OTHER
    ADD COLUMN payout_provider     VARCHAR(80),               -- bank name for BANK
    ADD COLUMN payout_account_name VARCHAR(120),
    ADD COLUMN payout_account      VARCHAR(40);

CREATE TABLE payouts (
    id               BIGSERIAL PRIMARY KEY,
    shop_id          BIGINT        NOT NULL REFERENCES shops (id),
    amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status           VARCHAR(20)   NOT NULL DEFAULT 'REQUESTED', -- REQUESTED, PAID, REJECTED
    method           VARCHAR(20)   NOT NULL,
    provider         VARCHAR(80),
    account_name     VARCHAR(120)  NOT NULL,
    account          VARCHAR(40)   NOT NULL,                  -- copied from the shop when requested
    reference        VARCHAR(120),                            -- bank / wallet transfer reference
    note             VARCHAR(500),
    requested_by     VARCHAR(200),
    decided_by       VARCHAR(200),
    requested_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    decided_at       TIMESTAMPTZ,
    version          INT           NOT NULL DEFAULT 0
);
CREATE INDEX idx_payouts_status ON payouts (status, requested_at);
CREATE INDEX idx_payouts_shop ON payouts (shop_id, requested_at);

-- Parcels of orders that were already paid before M6: their seller earns the full amount (no commission at launch),
-- released if delivered, otherwise held.
UPDATE order_parcels p
SET commission_percent = 0,
    commission_amount  = 0,
    seller_amount      = p.items_total + p.delivery_fee,
    payout_status      = CASE WHEN p.fulfilment_status = 'DELIVERED' THEN 'RELEASED'
                              WHEN p.fulfilment_status = 'CANCELLED' THEN 'CANCELLED' ELSE 'HELD' END,
    released_at        = CASE WHEN p.fulfilment_status = 'DELIVERED' THEN now() END
FROM orders o
WHERE o.id = p.order_id AND p.shop_id IS NOT NULL AND o.paid_at IS NOT NULL;
