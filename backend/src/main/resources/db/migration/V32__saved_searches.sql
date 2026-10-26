-- M9: saved searches with alerts. A shopper saves the shop page's search (words, category, details, price range);
-- every 15 minutes new matching listings are sent to their inbox (and Telegram if linked), and by SMS at most once a
-- day per search when they chose SMS.

create table saved_searches (
    id                    bigserial    primary key,
    user_id               uuid         not null references users (id) on delete cascade,
    name                  varchar(80)  not null,
    q                     varchar(120),
    category_slug         varchar(120),
    -- {"brand":"Samsung","storage":"128 GB"}: the shop page's spec.<key> filters
    specs                 jsonb        not null default '{}'::jsonb,
    min_price             numeric(12, 2),
    max_price             numeric(12, 2),
    alert_inbox           boolean      not null default true,
    alert_sms             boolean      not null default false,
    -- listings up to this id were already seen (the newest listing when the search was saved)
    last_seen_product_id  bigint       not null default 0,
    last_alert_at         timestamptz,
    last_sms_at           timestamptz,
    created_at            timestamptz  not null default now(),
    updated_at            timestamptz  not null default now()
);
create index saved_searches_user_idx on saved_searches (user_id);
create index saved_searches_alerts_idx on saved_searches (id) where alert_inbox or alert_sms;
