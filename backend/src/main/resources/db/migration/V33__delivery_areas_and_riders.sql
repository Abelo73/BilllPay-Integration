-- Sodo Gebeya M21: delivery fee per area of Sodo, partner riders, a rider per parcel.

-- NULL = the standard delivery fee (DELIVERY_FLAT_FEE); 0 = free delivery to this area.
ALTER TABLE areas ADD COLUMN delivery_fee NUMERIC(12, 2) CHECK (delivery_fee IS NULL OR delivery_fee >= 0);

-- The area the buyer picked at checkout (text, so renaming an area later doesn't change old orders).
ALTER TABLE orders ADD COLUMN delivery_area VARCHAR(120);

CREATE TABLE riders (
    id          BIGSERIAL     PRIMARY KEY,
    name        VARCHAR(120)  NOT NULL,
    phone       VARCHAR(20)   NOT NULL,
    note        VARCHAR(300),                -- e.g. "Bajaj, mornings only"
    active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE order_parcels ADD COLUMN rider_id BIGINT REFERENCES riders (id);
ALTER TABLE order_parcels ADD COLUMN rider_assigned_at TIMESTAMPTZ;
CREATE INDEX idx_order_parcels_rider ON order_parcels (rider_id) WHERE rider_id IS NOT NULL;
