-- Favourites (the heart): a shopper keeps listings to come back to, and hears when one gets cheaper.

create table favourites (
    id               bigserial    primary key,
    user_id          uuid         not null references users (id) on delete cascade,
    product_id       bigint       not null references products (id) on delete cascade,
    -- the price when it was saved, to say "was 9,500, now 8,000"
    price_when_saved numeric(12, 2),
    created_at       timestamptz  not null default now(),
    unique (user_id, product_id)
);
create index favourites_product_idx on favourites (product_id);
create index favourites_user_idx on favourites (user_id, created_at desc);
