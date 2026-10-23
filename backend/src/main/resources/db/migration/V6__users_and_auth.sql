-- Customers and staff share one table; the role decides which portal they can sign in to.
CREATE TABLE users (
    id              UUID PRIMARY KEY,
    email           VARCHAR(200) NOT NULL UNIQUE,      -- stored lower-case
    password_hash   VARCHAR(100) NOT NULL,             -- BCrypt
    full_name       VARCHAR(200) NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER', 'SUPPORT', 'ADMIN')),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    -- bumped on password change, disable, role change or "log out everywhere": older tokens stop working
    token_version   INT NOT NULL DEFAULT 0,
    failed_logins   INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_users_role ON users (role, created_at);

CREATE TABLE login_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users (id),
    email       VARCHAR(200),
    portal      VARCHAR(10) NOT NULL,                  -- SHOP or ADMIN
    success     BOOLEAN NOT NULL,
    reason      VARCHAR(40) NOT NULL,                  -- SUCCESS, WRONG_PASSWORD, LOCKED, DISABLED, ...
    ip          VARCHAR(64),
    user_agent  VARCHAR(300),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_events_created ON login_events (created_at);
CREATE INDEX idx_login_events_user ON login_events (user_id, created_at);

-- Orders placed while signed in belong to that customer; guest orders keep user_id NULL.
ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES users (id);
CREATE INDEX idx_orders_user ON orders (user_id, created_at);
