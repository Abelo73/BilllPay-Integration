-- Delivery tracking. A rider gets a personal link by SMS; the link shares their location for one parcel only.
-- Only the SHA-256 of the link's secret is stored (the secret itself is only in the SMS). Only the latest point is kept.
CREATE TABLE rider_share_links (
    id          BIGSERIAL PRIMARY KEY,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    parcel_id   BIGINT       NOT NULL REFERENCES order_parcels (id) ON DELETE CASCADE,
    rider_id    BIGINT       NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ  NOT NULL
);
CREATE INDEX idx_rider_share_links_parcel ON rider_share_links (parcel_id);

CREATE TABLE parcel_live_location (
    parcel_id   BIGINT PRIMARY KEY REFERENCES order_parcels (id) ON DELETE CASCADE,
    latitude    NUMERIC(9, 6) NOT NULL,
    longitude   NUMERIC(9, 6) NOT NULL,
    travel_mode VARCHAR(4)    NOT NULL CHECK (travel_mode IN ('CAR', 'WALK')),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
