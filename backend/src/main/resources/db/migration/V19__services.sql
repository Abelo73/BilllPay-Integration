-- Hire a pro (Sodo Gebeya M13–M14): pro profiles, job requests, quotes. Deposits come with M15.

CREATE TABLE pro_profiles (
    id                BIGSERIAL PRIMARY KEY,
    owner_id          UUID         NOT NULL UNIQUE REFERENCES users (id),
    display_name      VARCHAR(120) NOT NULL,
    trade             VARCHAR(30)  NOT NULL,      -- ELECTRICIAN, PLUMBER, CARPENTER, TAILOR, PAINTER, PHONE_REPAIR, TUTOR, MECHANIC, CLEANING, OTHER
    headline          VARCHAR(160),
    bio               VARCHAR(2000),
    years_experience  INT CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
    areas             VARCHAR(300),               -- where they work, e.g. "Sodo town, Boditi road"
    phone             VARCHAR(20)  NOT NULL,      -- shared with a customer only after they accept a quote
    avatar_key        VARCHAR(300),
    status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, SUSPENDED
    status_note       VARCHAR(500),
    decided_at        TIMESTAMPTZ,
    decided_by        VARCHAR(200),
    jobs_done         INT          NOT NULL DEFAULT 0,
    rating_sum        INT          NOT NULL DEFAULT 0,
    rating_count      INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ,
    version           INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_pro_profiles_trade ON pro_profiles (trade, status);

CREATE TABLE pro_prices (
    id          BIGSERIAL PRIMARY KEY,
    pro_id      BIGINT        NOT NULL REFERENCES pro_profiles (id) ON DELETE CASCADE,
    label       VARCHAR(120)  NOT NULL,       -- "Install a socket"
    price_from  NUMERIC(12, 2),               -- null = "ask for a quote"
    position    INT           NOT NULL
);

CREATE TABLE pro_photos (
    id          BIGSERIAL PRIMARY KEY,
    pro_id      BIGINT        NOT NULL REFERENCES pro_profiles (id) ON DELETE CASCADE,
    image_key   VARCHAR(300)  NOT NULL,
    position    INT           NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE job_requests (
    id                 BIGSERIAL PRIMARY KEY,
    customer_id        UUID          NOT NULL REFERENCES users (id),
    trade              VARCHAR(30)   NOT NULL,
    description        VARCHAR(2000) NOT NULL,
    area               VARCHAR(200)  NOT NULL,
    timing             VARCHAR(20)   NOT NULL,     -- TODAY, TOMORROW, THIS_WEEK, DATE
    preferred_date     DATE,
    budget             NUMERIC(12, 2),
    direct_pro_id      BIGINT        REFERENCES pro_profiles (id),   -- asked one pro directly from their profile
    status             VARCHAR(20)   NOT NULL DEFAULT 'OPEN',        -- OPEN, ASSIGNED, DONE, CANCELLED, EXPIRED
    accepted_quote_id  BIGINT,
    rating             SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    review             VARCHAR(1000),
    completed_at       TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ   NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_requests_customer ON job_requests (customer_id, created_at DESC);
CREATE INDEX idx_job_requests_open ON job_requests (trade, status, created_at DESC);

CREATE TABLE job_photos (
    id          BIGSERIAL PRIMARY KEY,
    job_id      BIGINT        NOT NULL REFERENCES job_requests (id) ON DELETE CASCADE,
    image_key   VARCHAR(300)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE job_quotes (
    id          BIGSERIAL PRIMARY KEY,
    job_id      BIGINT        NOT NULL REFERENCES job_requests (id),
    pro_id      BIGINT        NOT NULL REFERENCES pro_profiles (id),
    price       NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    message     VARCHAR(1000),
    available   VARCHAR(120),               -- "Today 3 PM"
    status      VARCHAR(20)   NOT NULL DEFAULT 'SENT',   -- SENT, ACCEPTED, DECLINED, WITHDRAWN
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (job_id, pro_id)
);
CREATE INDEX idx_job_quotes_pro ON job_quotes (pro_id, created_at DESC);

ALTER TABLE job_requests ADD CONSTRAINT fk_job_accepted_quote FOREIGN KEY (accepted_quote_id) REFERENCES job_quotes (id);
