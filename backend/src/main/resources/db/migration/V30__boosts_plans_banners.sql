-- M16 boosts (a listing on top of search and the home page for 3/7/14 days), M17 the Pro shop plan (no product
-- limit, Pro badge, statistics, lower commission) and banner ads on the home page. While online payment is off, sellers
-- pay by telebirr or bank and staff confirm, like CV orders.

alter table products add column boosted_until timestamptz;
create index products_boosted_idx on products (boosted_until) where boosted_until is not null;

create table boosts (
    id                bigserial primary key,
    product_id        bigint        not null references products (id),
    shop_id           bigint        references shops (id),
    days              int           not null,
    price             numeric(12, 2) not null,
    -- REQUESTED (waiting for payment), ACTIVE, ENDED, REJECTED, CANCELLED
    status            varchar(16)   not null default 'REQUESTED',
    payment_reference varchar(120),
    starts_at         timestamptz,
    ends_at           timestamptz,
    decided_by        varchar(200),
    note              varchar(500),
    created_at        timestamptz   not null default now(),
    updated_at        timestamptz   not null default now()
);
create index boosts_status_idx on boosts (status, created_at);
create index boosts_shop_idx on boosts (shop_id, created_at desc);

alter table shops add column plan varchar(10) not null default 'FREE';
alter table shops add column plan_until timestamptz;
alter table shops add column plan_reminded_at timestamptz;

create table plan_orders (
    id                bigserial primary key,
    shop_id           bigint        not null references shops (id),
    months            int           not null,
    price             numeric(12, 2) not null,
    -- REQUESTED, PAID (plan extended), REJECTED, CANCELLED
    status            varchar(16)   not null default 'REQUESTED',
    payment_reference varchar(120),
    decided_by        varchar(200),
    note              varchar(500),
    created_at        timestamptz   not null default now(),
    updated_at        timestamptz   not null default now()
);
create index plan_orders_status_idx on plan_orders (status, created_at);

create table banner_ads (
    id          bigserial primary key,
    title       varchar(120) not null,
    subtitle    varchar(200),
    image_key   varchar(300),
    link_url    varchar(500),
    -- shown between these dates (empty = always), while active
    starts_at   timestamptz,
    ends_at     timestamptz,
    active      boolean      not null default true,
    position    int          not null default 0,
    clicks      int          not null default 0,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);
