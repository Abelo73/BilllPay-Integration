-- Jobs, talent profiles and the CV service (J1–J7). Each part has a switch in Admin → Features.

-- J1: a job seeker's profile. Private by default; the phone number is never shown publicly.
CREATE TABLE talent_profiles (
    id                     BIGSERIAL PRIMARY KEY,
    user_id                UUID          NOT NULL UNIQUE REFERENCES users (id),
    full_name              VARCHAR(120)  NOT NULL,
    status                 VARCHAR(20)   NOT NULL,          -- STUDENT, GRADUATE, LOOKING, WORKING_OPEN
    headline               VARCHAR(160),                    -- "Accounting graduate, Excel and Peachtree"
    about                  VARCHAR(1500),
    school                 VARCHAR(160),
    field_of_study         VARCHAR(160),
    graduation_year        INT,
    skills                 VARCHAR(1000),                   -- comma separated
    languages              VARCHAR(300),                    -- comma separated
    work_types             VARCHAR(120),                    -- FULL_TIME, PART_TIME, INTERNSHIP, WEEKEND
    work_places            VARCHAR(120),                    -- SODO, NEARBY, REMOTE
    photo_key              VARCHAR(300),
    public_profile         BOOLEAN       NOT NULL DEFAULT false,
    -- J7: verified student badge
    student_status         VARCHAR(20)   NOT NULL DEFAULT 'NONE', -- NONE, SUBMITTED, APPROVED, REJECTED
    student_note           VARCHAR(300),
    student_verified_at    TIMESTAMPTZ,
    featured_until         TIMESTAMPTZ,                     -- J6
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ,
    version                INT           NOT NULL DEFAULT 0
);
CREATE INDEX idx_talent_public ON talent_profiles (public_profile, updated_at);

CREATE TABLE talent_experience (
    id           BIGSERIAL PRIMARY KEY,
    profile_id   BIGINT       NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,
    title        VARCHAR(120) NOT NULL,
    place        VARCHAR(120),
    start_month  VARCHAR(7),                                -- YYYY-MM
    end_month    VARCHAR(7),                                -- NULL = now
    description  VARCHAR(600),
    position     INT          NOT NULL DEFAULT 0
);

-- Private files of a profile: certificates, an uploaded CV (PDF), the student ID, professional CVs.
CREATE TABLE talent_files (
    id           BIGSERIAL PRIMARY KEY,
    profile_id   BIGINT       NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,
    kind         VARCHAR(20)  NOT NULL,                     -- CERTIFICATE, CV_UPLOAD, CV_PRO, STUDENT_ID
    storage_key  VARCHAR(300) NOT NULL,
    file_name    VARCHAR(160) NOT NULL,
    content_type VARCHAR(80)  NOT NULL,
    size_bytes   INT          NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_talent_files_profile ON talent_files (profile_id, kind);

-- J3: job posts. Staff check each one before it goes live.
CREATE TABLE job_posts (
    id             BIGSERIAL PRIMARY KEY,
    employer_id    UUID          NOT NULL REFERENCES users (id),
    employer_name  VARCHAR(120)  NOT NULL,
    title          VARCHAR(140)  NOT NULL,
    place          VARCHAR(120)  NOT NULL,
    job_type       VARCHAR(20)   NOT NULL,                  -- FULL_TIME, PART_TIME, INTERNSHIP, CONTRACT
    field          VARCHAR(80),
    salary_min     NUMERIC(12, 2),
    salary_max     NUMERIC(12, 2),
    salary_note    VARCHAR(80),
    description    VARCHAR(4000) NOT NULL,
    requirements   VARCHAR(2000),
    deadline       DATE          NOT NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING', -- PENDING, LIVE, REJECTED, CLOSED
    status_note    VARCHAR(400),
    fee            NUMERIC(12, 2) NOT NULL DEFAULT 0,       -- 0 = free post
    fee_paid       BOOLEAN       NOT NULL DEFAULT true,
    featured       BOOLEAN       NOT NULL DEFAULT false,
    decided_by     VARCHAR(200),
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ,
    version        INT           NOT NULL DEFAULT 0
);
CREATE INDEX idx_job_posts_status ON job_posts (status, deadline);
CREATE INDEX idx_job_posts_employer ON job_posts (employer_id, created_at);

-- J4: applications.
CREATE TABLE job_applications (
    id            BIGSERIAL PRIMARY KEY,
    job_id        BIGINT        NOT NULL REFERENCES job_posts (id),
    profile_id    BIGINT        NOT NULL REFERENCES talent_profiles (id),
    user_id       UUID          NOT NULL REFERENCES users (id),
    cv_kind       VARCHAR(20)   NOT NULL,                   -- AUTO, FILE (an uploaded or professional CV)
    cv_file_id    BIGINT        REFERENCES talent_files (id),
    message       VARCHAR(1000),
    status        VARCHAR(20)   NOT NULL DEFAULT 'NEW',     -- NEW, SHORTLISTED, INTERVIEW, HIRED, NOT_SELECTED
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    UNIQUE (job_id, user_id)
);
CREATE INDEX idx_job_applications_user ON job_applications (user_id, created_at);

-- J5: professional CV orders, written by our team.
CREATE TABLE cv_orders (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID          NOT NULL REFERENCES users (id),
    package             VARCHAR(20)   NOT NULL,              -- BASIC, COVER, PREMIUM
    express             BOOLEAN       NOT NULL DEFAULT false,
    language            VARCHAR(20)   NOT NULL DEFAULT 'EN', -- EN, AM, BOTH
    price               NUMERIC(12, 2) NOT NULL,
    discount_percent    INT           NOT NULL DEFAULT 0,
    total               NUMERIC(12, 2) NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'AWAITING_PAYMENT',
                        -- AWAITING_PAYMENT, PAID, WRITING, DRAFT_SENT, CHANGES, DONE, CANCELLED
    target_job          VARCHAR(200),
    details             VARCHAR(4000),                       -- achievements, projects, references, notes
    payment_reference   VARCHAR(120),
    writer              VARCHAR(120),
    changes_allowed     INT           NOT NULL DEFAULT 1,
    changes_used        INT           NOT NULL DEFAULT 0,
    change_request      VARCHAR(1500),
    due_at              TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    done_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ,
    version             INT           NOT NULL DEFAULT 0
);
CREATE INDEX idx_cv_orders_status ON cv_orders (status, due_at);
CREATE INDEX idx_cv_orders_user ON cv_orders (user_id, created_at);

CREATE TABLE cv_order_files (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES cv_orders (id),
    kind          VARCHAR(20)   NOT NULL,                    -- CUSTOMER, DRAFT, FINAL
    storage_key   VARCHAR(300)  NOT NULL,
    file_name     VARCHAR(160)  NOT NULL,
    content_type  VARCHAR(80)   NOT NULL,
    size_bytes    INT           NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_cv_order_files_order ON cv_order_files (order_id);
