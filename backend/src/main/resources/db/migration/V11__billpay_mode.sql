-- Sandbox / live switch: admins pick the BillPay mode in Admin → BillPay setup; keys stay in .env.
create table app_settings (
    key        varchar(100) primary key,
    value      varchar(500) not null,
    updated_at timestamptz  not null default now(),
    updated_by varchar(200)
);

-- Every order and payment remembers which BillPay it went to, so status checks, refunds and webhooks for it keep
-- using that environment's keys after a switch, and test orders stay out of live reports.
-- Everything before this migration was a sandbox payment.
alter table orders add column environment varchar(10) not null default 'SANDBOX';
alter table payment_attempts add column environment varchar(10) not null default 'SANDBOX';
-- which secret verified the webhook (null when it wasn't verified)
alter table billpay_webhook_events add column environment varchar(10);

create index idx_orders_environment_created on orders (environment, created_at);
