-- Phase 2 P3: delivery details, delivery fee and fulfilment (separate from payment status)

ALTER TABLE orders
    ADD COLUMN delivery_address  VARCHAR(300),
    ADD COLUMN delivery_city     VARCHAR(100),
    ADD COLUMN delivery_notes    VARCHAR(300),
    ADD COLUMN delivery_fee      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- null until paid; then UNFULFILLED → PROCESSING → SHIPPED → DELIVERED, or CANCELLED
    ADD COLUMN fulfilment_status VARCHAR(20),
    ADD COLUMN tracking_note     VARCHAR(300),
    ADD COLUMN shipped_at        TIMESTAMPTZ,
    ADD COLUMN delivered_at      TIMESTAMPTZ,
    ADD COLUMN cancelled_at      TIMESTAMPTZ;

UPDATE orders SET fulfilment_status = 'UNFULFILLED' WHERE status IN ('PAID', 'PARTIALLY_REFUNDED');

CREATE INDEX idx_orders_fulfilment ON orders (fulfilment_status) WHERE fulfilment_status IS NOT NULL;

-- Saved delivery addresses for signed-in customers
CREATE TABLE customer_addresses (
    id             BIGSERIAL PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    label          VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(200) NOT NULL,
    phone          VARCHAR(30) NOT NULL,
    address_line   VARCHAR(300) NOT NULL,
    city           VARCHAR(100) NOT NULL,
    notes          VARCHAR(300),
    is_default     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_addresses_user ON customer_addresses (user_id);
