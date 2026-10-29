-- A refund is now "money we owe the buyer" and stays open until the money is back: a refused or unanswered call to
-- BillPay is one attempt, not the end. Temporary failures are retried on their own; the rest wait for staff, who can
-- try again, record a payment made another way, or cancel the refund.

ALTER TABLE refunds
    ADD COLUMN attempts          INT NOT NULL DEFAULT 1,
    ADD COLUMN next_try_at       TIMESTAMPTZ,
    ADD COLUMN needs_staff_why   VARCHAR(300),
    ADD COLUMN manual_reference  VARCHAR(120),
    ADD COLUMN staff_note        VARCHAR(1000),
    ADD COLUMN handled_by        VARCHAR(200),
    ADD COLUMN stuck_alerted_at  TIMESTAMPTZ;

CREATE INDEX idx_refunds_next_try ON refunds (next_try_at) WHERE next_try_at IS NOT NULL;
CREATE INDEX idx_refunds_status ON refunds (status, updated_at);

-- Every call to BillPay for a refund, oldest first. A resend after no answer keeps its key; a new try after a refusal
-- gets a new one (the old key would only replay the refusal).
CREATE TABLE refund_attempts (
    id               UUID PRIMARY KEY,
    refund_id        UUID NOT NULL REFERENCES refunds (id),
    attempt_no       INT NOT NULL,
    idempotency_key  UUID NOT NULL,
    -- ACCEPTED (BillPay took it), REFUSED (a definite no), NO_ANSWER (timeout, 5xx, 429)
    outcome          VARCHAR(20) NOT NULL,
    http_status      INT,
    reason_code      VARCHAR(60),
    error            TEXT,
    response_payload TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refund_attempts_refund ON refund_attempts (refund_id, attempt_no);
