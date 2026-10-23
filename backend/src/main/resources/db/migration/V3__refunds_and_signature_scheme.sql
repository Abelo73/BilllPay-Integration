-- Which signing scheme matched (or was detected) for a webhook; helps pin down BillPay's format (Q3)
ALTER TABLE billpay_webhook_events ADD COLUMN signature_scheme VARCHAR(120);

CREATE TABLE refunds (
    id                 UUID PRIMARY KEY,
    order_id           UUID NOT NULL REFERENCES orders (id),
    payment_attempt_id UUID NOT NULL REFERENCES payment_attempts (id),
    merchant_reference VARCHAR(60) NOT NULL UNIQUE,
    idempotency_key    UUID NOT NULL UNIQUE,
    billpay_refund_id  VARCHAR(100) UNIQUE,
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency           CHAR(3) NOT NULL,
    reason             VARCHAR(500),
    status             VARCHAR(20) NOT NULL,
    reason_code        VARCHAR(60),
    -- true when BillPay told us about a refund we didn't start (e.g. issued from the dashboard)
    external           BOOLEAN NOT NULL DEFAULT FALSE,
    request_payload    TEXT,
    response_payload   TEXT,
    error              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version            INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_refunds_order ON refunds (order_id, created_at);
CREATE INDEX idx_refunds_attempt ON refunds (payment_attempt_id);
