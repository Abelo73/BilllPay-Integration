-- Phase 2 P5: discount codes, applied to the items before the total goes to BillPay

CREATE TABLE discount_codes (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(40)  NOT NULL UNIQUE,          -- stored upper-case
    description   VARCHAR(200),
    kind          VARCHAR(10)  NOT NULL CHECK (kind IN ('PERCENT', 'FIXED')),
    value         NUMERIC(12, 2) NOT NULL CHECK (value > 0),
    max_discount  NUMERIC(12, 2),                        -- cap for PERCENT codes
    min_subtotal  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    starts_at     TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    usage_limit   INT CHECK (usage_limit IS NULL OR usage_limit > 0),
    -- held by unpaid orders + used by paid ones; released when an order is cancelled or expires
    times_used    INT NOT NULL DEFAULT 0,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    version       INT NOT NULL DEFAULT 0,
    CHECK (kind <> 'PERCENT' OR value <= 100)
);

ALTER TABLE orders
    ADD COLUMN discount_code   VARCHAR(40),
    ADD COLUMN discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX idx_orders_discount_code ON orders (discount_code) WHERE discount_code IS NOT NULL;
