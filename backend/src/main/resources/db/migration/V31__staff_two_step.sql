-- M23: 2-step sign-in for staff. After the password, a 6-digit code (SMS and email); a device can be trusted for
-- 30 days so the code isn't asked every time. Switched on in Admin → Features ("staff_two_step").

create table staff_login_codes (
    id          uuid         primary key,
    user_id     uuid         not null references users (id),
    code_hash   varchar(64)  not null,
    attempts    int          not null default 0,
    expires_at  timestamptz  not null,
    used_at     timestamptz,
    ip          varchar(64),
    created_at  timestamptz  not null default now()
);
create index staff_login_codes_user_idx on staff_login_codes (user_id, created_at desc);

create table trusted_devices (
    id           bigserial    primary key,
    user_id      uuid         not null references users (id) on delete cascade,
    token_hash   varchar(64)  not null unique,
    label        varchar(200),
    -- the account's session version when trusted: a password change (which signs out everywhere) ends the trust
    token_version int         not null,
    expires_at   timestamptz  not null,
    last_used_at timestamptz,
    created_at   timestamptz  not null default now()
);
create index trusted_devices_user_idx on trusted_devices (user_id);
