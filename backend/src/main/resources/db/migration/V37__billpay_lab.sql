-- Admin → BillPay lab: test payments made straight against BillPay (sandbox or live), with every API call kept,
-- so staff can see exactly how BillPay behaves. Not linked to orders; webhooks are matched by BillPay's payment id.
CREATE TABLE billpay_lab_runs (
    id                  UUID          PRIMARY KEY,
    environment         VARCHAR(10)   NOT NULL,           -- SANDBOX or LIVE
    merchant_reference  VARCHAR(60)   NOT NULL UNIQUE,     -- LAB-...
    billpay_payment_id  VARCHAR(80),
    amount              NUMERIC(12, 2) NOT NULL,
    description         VARCHAR(200),
    status              VARCHAR(40),                       -- BillPay's last word: CREATED, PROCESSING, CAPTURED...
    checkout_url        VARCHAR(500),
    created_by          VARCHAR(200),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_billpay_lab_runs_payment ON billpay_lab_runs (billpay_payment_id);

-- Every call the lab made to BillPay: what we sent, what came back, how long it took.
CREATE TABLE billpay_lab_calls (
    id           BIGSERIAL     PRIMARY KEY,
    run_id       UUID          NOT NULL REFERENCES billpay_lab_runs (id) ON DELETE CASCADE,
    operation    VARCHAR(40)   NOT NULL,                   -- create_payment, get_payment, create_refund
    http_status  INTEGER,                                  -- null = no answer (network error)
    duration_ms  INTEGER       NOT NULL,
    request      TEXT,
    response     TEXT,
    error        VARCHAR(500),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_billpay_lab_calls_run ON billpay_lab_calls (run_id, created_at);
