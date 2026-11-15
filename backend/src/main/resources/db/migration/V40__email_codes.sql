-- Sign-up by email code: before an email + password account is made, the customer types the 6-digit code we emailed.
-- Same rules as phone codes (V14): only an HMAC of the code is kept, 5 minutes, 5 tries, a new code retires older ones.
CREATE TABLE email_codes (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(200) NOT NULL,
    code_hash    VARCHAR(64)  NOT NULL,
    purpose      VARCHAR(20)  NOT NULL DEFAULT 'SIGN_UP',
    attempts     INT          NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ  NOT NULL,
    used_at      TIMESTAMPTZ,                       -- account made, replaced by a newer code, or too many tries
    ip           VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_codes_email ON email_codes (email, created_at);
CREATE INDEX idx_email_codes_ip ON email_codes (ip, created_at);
