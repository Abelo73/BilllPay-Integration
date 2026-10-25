-- Sodo Gebeya M5: one checkout, one parcel per seller. The buyer pays once for the order (one BillPay payment);
-- each seller packs and delivers their own parcel, with its own delivery fee and delivery steps.

CREATE TABLE order_parcels (
    id                 BIGSERIAL PRIMARY KEY,
    order_id           UUID          NOT NULL REFERENCES orders (id),
    parcel_no          INT           NOT NULL,              -- shown as <order number>-<parcel_no>
    shop_id            BIGINT        REFERENCES shops (id), -- NULL = sold by Sodo Gebeya
    items_total        NUMERIC(12, 2) NOT NULL,
    discount_share     NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- part of the order's discount carried by this parcel
    delivery_fee       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    fulfilment_status  VARCHAR(20),                         -- NULL until the order is paid
    tracking_note      VARCHAR(300),
    shipped_at         TIMESTAMPTZ,
    delivered_at       TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ,
    version            INT           NOT NULL DEFAULT 0,
    UNIQUE (order_id, parcel_no)
);
CREATE INDEX idx_order_parcels_shop ON order_parcels (shop_id, fulfilment_status);

ALTER TABLE order_items ADD COLUMN parcel_no INT;

-- Existing orders: one parcel per seller found in their lines (Sodo Gebeya's own lines first), carrying the
-- order's delivery progress. The first parcel keeps the order's delivery fee and discount.
WITH sellers AS (
    SELECT o.id AS order_id, i.shop_id,
           row_number() OVER (PARTITION BY o.id ORDER BY i.shop_id NULLS FIRST) AS parcel_no,
           sum(i.line_total) AS items_total
    FROM orders o JOIN order_items i ON i.order_id = o.id
    GROUP BY o.id, i.shop_id
)
INSERT INTO order_parcels (order_id, parcel_no, shop_id, items_total, discount_share, delivery_fee,
                           fulfilment_status, tracking_note, shipped_at, delivered_at, cancelled_at, created_at)
SELECT s.order_id, s.parcel_no, s.shop_id, s.items_total,
       CASE WHEN s.parcel_no = 1 THEN o.discount_amount ELSE 0 END,
       CASE WHEN s.parcel_no = 1 THEN o.delivery_fee ELSE 0 END,
       o.fulfilment_status, o.tracking_note, o.shipped_at, o.delivered_at,
       CASE WHEN o.fulfilment_status = 'CANCELLED' THEN o.cancelled_at END, o.created_at
FROM sellers s JOIN orders o ON o.id = s.order_id;

UPDATE order_items i SET parcel_no = p.parcel_no
FROM order_parcels p
WHERE p.order_id = i.order_id AND p.shop_id IS NOT DISTINCT FROM i.shop_id;
