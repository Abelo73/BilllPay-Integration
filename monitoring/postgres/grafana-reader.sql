-- Read-only database user for Grafana (data source "TenaShop DB").
-- Run by the one-shot `grafana-db-init` service on every `docker compose up`, so it is safe to repeat.
-- Grafana can only read the columns listed below: no customer names, phones, emails, addresses,
-- password hashes or BillPay payloads. Columns that don't exist yet are skipped and picked up on the next run.
-- Variables (psql -v): reader_password, dbname

SELECT 'CREATE ROLE grafana_reader LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_reader') \gexec

ALTER ROLE grafana_reader WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'reader_password';
ALTER ROLE grafana_reader SET default_transaction_read_only = on;
ALTER ROLE grafana_reader SET statement_timeout = '15s';
ALTER ROLE grafana_reader CONNECTION LIMIT 10;

GRANT CONNECT ON DATABASE :"dbname" TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;

-- start from nothing, then grant exactly the list
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_reader;

WITH wanted(tbl, cols) AS (VALUES
  ('orders', ARRAY['id', 'order_number', 'status', 'subtotal', 'total', 'currency', 'paid_at', 'created_at', 'updated_at',
                   'discount_code', 'discount_amount', 'delivery_city', 'delivery_fee', 'fulfilment_status',
                   'shipped_at', 'delivered_at', 'cancelled_at', 'environment']),
  ('order_items', ARRAY['id', 'order_id', 'product_id', 'product_name', 'unit_price', 'quantity', 'line_total']),
  ('payment_attempts', ARRAY['id', 'order_id', 'attempt_no', 'status', 'amount', 'currency', 'payment_method',
                             'reason_code', 'expires_at', 'created_at', 'updated_at', 'environment']),
  ('refunds', ARRAY['id', 'order_id', 'amount', 'currency', 'status', 'reason_code', 'external', 'created_at', 'updated_at']),
  ('billpay_webhook_events', ARRAY['id', 'event_type', 'reported_status', 'signature_valid', 'status',
                                   'received_at', 'processed_at', 'environment']),
  ('notifications', ARRAY['id', 'kind', 'status', 'created_at', 'sent_at']),
  ('products', ARRAY['id', 'category_id', 'name', 'price', 'stock', 'reserved', 'active', 'featured', 'low_stock_threshold']),
  ('categories', ARRAY['id', 'name', 'active']),
  ('discount_codes', ARRAY['id', 'code', 'kind', 'value', 'times_used', 'usage_limit', 'active', 'expires_at']),
  ('login_events', ARRAY['id', 'portal', 'success', 'reason', 'created_at'])
)
SELECT format('GRANT SELECT (%s) ON public.%I TO grafana_reader',
              string_agg(quote_ident(c.column_name), ', '), w.tbl)
FROM wanted w
JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = w.tbl AND c.column_name = ANY (w.cols)
GROUP BY w.tbl \gexec
