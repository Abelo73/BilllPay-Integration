CREATE TABLE categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
    id          BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories (id),
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    price       NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    currency    CHAR(3) NOT NULL DEFAULT 'ETB',
    stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    reserved    INT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    image_url   VARCHAR(500),
    featured    BOOLEAN NOT NULL DEFAULT FALSE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version     INT NOT NULL DEFAULT 0
);

CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
    id             UUID PRIMARY KEY,
    order_number   VARCHAR(40) NOT NULL UNIQUE,
    status         VARCHAR(30) NOT NULL,
    subtotal       NUMERIC(12, 2) NOT NULL,
    total          NUMERIC(12, 2) NOT NULL,
    currency       CHAR(3) NOT NULL,
    customer_name  VARCHAR(200) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    customer_email VARCHAR(200) NOT NULL,
    paid_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    version        INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

CREATE TABLE order_items (
    id           BIGSERIAL PRIMARY KEY,
    order_id     UUID NOT NULL REFERENCES orders (id),
    product_id   BIGINT NOT NULL REFERENCES products (id),
    product_name VARCHAR(200) NOT NULL,
    unit_price   NUMERIC(12, 2) NOT NULL,
    quantity     INT NOT NULL CHECK (quantity > 0),
    line_total   NUMERIC(12, 2) NOT NULL
);

CREATE TABLE order_events (
    id          BIGSERIAL PRIMARY KEY,
    order_id    UUID NOT NULL REFERENCES orders (id),
    type        VARCHAR(50) NOT NULL,
    from_status VARCHAR(30),
    to_status   VARCHAR(30),
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON order_events (order_id, created_at);

CREATE TABLE payment_attempts (
    id                 UUID PRIMARY KEY,
    order_id           UUID NOT NULL REFERENCES orders (id),
    attempt_no         INT NOT NULL,
    merchant_reference VARCHAR(60) NOT NULL UNIQUE,
    idempotency_key    UUID NOT NULL UNIQUE,
    billpay_payment_id VARCHAR(100) UNIQUE,
    checkout_url       VARCHAR(1000),
    status             VARCHAR(20) NOT NULL,
    amount             NUMERIC(12, 2) NOT NULL,
    currency           CHAR(3) NOT NULL,
    payment_method     VARCHAR(40),
    reason_code        VARCHAR(60),
    request_payload    TEXT,
    response_payload   TEXT,
    error              TEXT,
    expires_at         TIMESTAMPTZ,
    last_checked_at    TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version            INT NOT NULL DEFAULT 0,
    UNIQUE (order_id, attempt_no)
);
CREATE INDEX idx_payment_attempts_status ON payment_attempts (status, created_at);

CREATE TABLE billpay_webhook_events (
    id                 BIGSERIAL PRIMARY KEY,
    billpay_event_id   VARCHAR(100),
    billpay_payment_id VARCHAR(100),
    merchant_reference VARCHAR(60),
    event_type         VARCHAR(60),
    reported_status    VARCHAR(40),
    headers            TEXT,
    payload            TEXT NOT NULL,
    signature_valid    BOOLEAN,
    status             VARCHAR(20) NOT NULL,
    error              TEXT,
    received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_webhook_event_id ON billpay_webhook_events (billpay_event_id) WHERE billpay_event_id IS NOT NULL;
CREATE INDEX idx_webhook_status ON billpay_webhook_events (status, received_at);
CREATE INDEX idx_webhook_payment ON billpay_webhook_events (billpay_payment_id);
