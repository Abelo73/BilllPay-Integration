-- M8 disputes: a buyer reports a problem with one parcel; the seller answers; staff decide (refund, part refund,
-- or pay the seller). While a dispute is open the parcel's money stays held.

create table disputes (
    id             bigserial primary key,
    order_id       uuid         not null references orders (id),
    parcel_id      bigint       not null references order_parcels (id),
    shop_id        bigint       references shops (id),
    buyer_id       uuid         references users (id),
    -- NOT_RECEIVED, NOT_AS_DESCRIBED, DAMAGED, WRONG_ITEM, MISSING_ITEMS, OTHER
    reason         varchar(30)  not null,
    details        varchar(2000) not null,
    -- OPEN, REFUNDED, PART_REFUNDED, SELLER_PAID, WITHDRAWN
    status         varchar(20)  not null default 'OPEN',
    refund_amount  numeric(12, 2),
    decision_note  varchar(1000),
    decided_by     varchar(200),
    seller_replied_at timestamptz,
    created_at     timestamptz  not null default now(),
    resolved_at    timestamptz,
    updated_at     timestamptz  not null default now()
);
create index disputes_status_idx on disputes (status, created_at);
create index disputes_shop_idx on disputes (shop_id, created_at desc);
create index disputes_buyer_idx on disputes (buyer_id, created_at desc);
-- one open dispute per parcel
create unique index disputes_one_open_per_parcel on disputes (parcel_id) where status = 'OPEN';

create table dispute_messages (
    id          bigserial primary key,
    dispute_id  bigint       not null references disputes (id) on delete cascade,
    -- BUYER, SELLER, STAFF
    author      varchar(10)  not null,
    author_name varchar(200),
    body        varchar(2000) not null,
    created_at  timestamptz  not null default now()
);
create index dispute_messages_idx on dispute_messages (dispute_id, id);

-- photos of the problem (private: only the buyer, the seller and staff can open them)
create table dispute_photos (
    id          bigserial primary key,
    dispute_id  bigint       not null references disputes (id) on delete cascade,
    storage_key varchar(300) not null,
    created_at  timestamptz  not null default now()
);
