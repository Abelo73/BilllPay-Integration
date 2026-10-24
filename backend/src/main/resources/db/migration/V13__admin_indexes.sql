-- Indexes for the admin screens: order search, newest-first lists, per-mode dashboards and reports.

-- Order search matches "contains" (LIKE '%…%') on number, name and phone; trigram indexes make that fast.
create extension if not exists pg_trgm;
create index if not exists idx_orders_number_trgm on orders using gin (order_number gin_trgm_ops);
create index if not exists idx_orders_name_trgm on orders using gin (lower(customer_name) gin_trgm_ops);
create index if not exists idx_orders_phone_trgm on orders using gin (customer_phone gin_trgm_ops);

-- Newest-first lists (orders, payments, webhooks, refunds) and per-mode dashboards / reports
create index if not exists idx_orders_created on orders (created_at desc);
create index if not exists idx_payment_attempts_env_created on payment_attempts (environment, created_at);
create index if not exists idx_payment_attempts_created on payment_attempts (created_at desc);
create index if not exists idx_webhook_received on billpay_webhook_events (received_at desc);
create index if not exists idx_webhook_reference on billpay_webhook_events (merchant_reference);
create index if not exists idx_refunds_created on refunds (created_at desc);

-- Order lines are always read per order (order page, top products report)
create index if not exists idx_order_items_order on order_items (order_id);
