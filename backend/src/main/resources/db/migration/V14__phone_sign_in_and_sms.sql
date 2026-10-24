-- Sign in with a phone number and an SMS code (Sodo Gebeya M2).

-- Phone-only customers have no email or password.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- A phone signs in only after its owner proved it with a code. Unproven phones (typed in a profile) never do,
-- so one person can't claim another's number by typing it.
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX ux_users_verified_phone ON users (phone) WHERE phone_verified_at IS NOT NULL;

-- One-time sign-in codes. Only an HMAC of the code is stored.
CREATE TABLE phone_codes (
    id           BIGSERIAL PRIMARY KEY,
    phone        VARCHAR(20)  NOT NULL,
    code_hash    VARCHAR(64)  NOT NULL,
    purpose      VARCHAR(20)  NOT NULL DEFAULT 'SIGN_IN',
    attempts     INT          NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ  NOT NULL,
    used_at      TIMESTAMPTZ,                       -- signed in, replaced by a newer code, or too many tries
    ip           VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_phone_codes_phone ON phone_codes (phone, created_at);
CREATE INDEX idx_phone_codes_ip ON phone_codes (ip, created_at);

-- Every SMS the shop sends (codes are stored masked).
CREATE TABLE sms_messages (
    id           BIGSERIAL PRIMARY KEY,
    kind         VARCHAR(40)  NOT NULL,
    recipient    VARCHAR(20)  NOT NULL,
    body         VARCHAR(480) NOT NULL,
    provider     VARCHAR(20)  NOT NULL,
    status       VARCHAR(20)  NOT NULL,             -- SENT, FAILED, LOGGED (test mode, not sent)
    provider_ref VARCHAR(100),
    error        TEXT,
    order_number VARCHAR(40),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_messages_created ON sms_messages (created_at);
CREATE INDEX idx_sms_messages_recipient ON sms_messages (recipient, created_at);
